<!--
  A2 — Schattenlauf. A MapLibre globe with the whole shadow path (dashed) and the live Moon
  shadow driven by a time slider. The heavy lifting lives in $lib/shadow-globe/*:
    · shadowPath      — precomputed central path + timeline frames
    · shadowProfile   — per-frame shadow axis + 1D coverage profile (LUT)
    · moonShadowLayer — the WebGL layer; samples the profile texture per pixel (day/night + shadow)
    · isoRing         — analytic 50/75/100 % rings (cylinder ∩ sphere)
  This component just wires those onto the map and to the slider UI.
-->
<script lang="ts">
	import { onMount } from 'svelte';
	import 'maplibre-gl/dist/maplibre-gl.css';
	import { t } from '$lib/i18n';
	import type { Map as MlMap, GeoJSONSource } from 'maplibre-gl';
	import { sunMoonECEF } from '$lib/eclipse';
	import { shadowFrames, shadowPathLine, timelineStart, timelineEnd, formatUtc } from '$lib/shadow-globe/shadowPath';
	import { computeShadowModel, radiusForCoverage } from '$lib/shadow-globe/shadowProfile';
	import { isoRing, terminatorLine, EMPTY_LINES } from '$lib/shadow-globe/isoRing';
	import { createMoonShadowLayer, type ShadowState } from '$lib/shadow-globe/moonShadowLayer';

	type Brand = { bg: string; path: string; ring: string };

	const SATELLITE_TILES = 'https://tiles.versatiles.org/tiles/satellite/{z}/{x}/{y}';
	const INITIAL_VIEW = { center: [-18, 58] as [number, number], zoom: 2.1 };

	// Coverage rings drawn live around the current shadow. `level` = obscuration threshold (0..1),
	// `percent` drives both the map opacity and the legend label.
	const ISO_RINGS = [
		{ id: 'iso50', level: 0.5, percent: 20 },
		{ id: 'iso75', level: 0.75, percent: 40 },
		{ id: 'iso100', level: 0.99, percent: 60 }
	];

	// Shared state the WebGL layer reads each frame (see moonShadowLayer.js): the shadow axis plus
	// the 1D coverage profile (as an 8-bit LUT). `profileVersion` bumps so the texture re-uploads.
	const shadowState: ShadowState = {
		center: [0, 0, 1],
		axis: [0, 0, 1],
		sunDir: [0, 0, 1],
		rMax: 0.5,
		profile: null,
		profileVersion: 0,
		ready: false
	};

	// ---- reactive UI state ----
	const START_INDEX = Math.floor(shadowFrames.length / 2);
	let mapContainer: HTMLDivElement;
	let frameIndex = $state(START_INDEX);
	let clockUtc = $state(formatUtc(shadowFrames[START_INDEX].time));
	let umbraCenterText = $state('');
	let mapReady = $state(false);
	/** Set once the map has loaded; renders the frame at `index`. */
	let showFrame: (index: number) => void = () => {};

	onMount(() => {
		let map: MlMap | undefined;
		let disposed = false;

		(async () => {
			const maplibregl = (await import('maplibre-gl')).default;
			if (disposed) return;

			const brand = readBrandColors();
			const m = new maplibregl.Map({
				container: mapContainer,
				...INITIAL_VIEW,
				scrollZoom: false, // don't trap page scroll; drag still spins the globe
				attributionControl: { compact: true },
				style: {
					version: 8,
					sources: {
						sat: {
							type: 'raster',
							tiles: [SATELLITE_TILES],
							tileSize: 512,
							maxzoom: 19,
							attribution: '© VersaTiles'
						}
					},
					layers: [
						{ id: 'bg', type: 'background', paint: { 'background-color': brand.bg } },
						{ id: 'sat', type: 'raster', source: 'sat', paint: { 'raster-brightness-max': 0.9 } }
					]
				}
			});
			map = m;
			m.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'top-right');

			m.on('load', () => {
				m.setProjection({ type: 'globe' });
				m.addLayer(createMoonShadowLayer(shadowState)); // darkening, under the reference lines
				addPathAndRings(m, brand);
				showFrame = (index) => renderFrame(m, index);
				showFrame(frameIndex);
				mapReady = true;
			});
		})();

		return () => {
			disposed = true;
			map?.remove();
		};
	});

	/** Pull brand colours from the central design tokens so the canvas honours them too. */
	function readBrandColors() {
		const css = getComputedStyle(document.documentElement);
		const token = (name: string, fallback: string) => {
			const v = css.getPropertyValue(name).trim();
			return !v || v.includes('var(') ? fallback : v;
		};
		return {
			bg: token('--bg', '#05070d'),
			path: token('--accent', '#e8a33d'),
			ring: token('--accent-2', '#ffd27f')
		};
	}

	/** Faint dashed whole-path line, then the three (initially empty) live ring layers on top. */
	function addPathAndRings(map: MlMap, brand: Brand) {
		map.addSource('path', { type: 'geojson', data: shadowPathLine });
		map.addLayer({
			id: 'path',
			type: 'line',
			source: 'path',
			paint: { 'line-color': brand.path, 'line-width': 1, 'line-opacity': 0.45 }
		});
		for (const ring of ISO_RINGS) {
			map.addSource(ring.id, { type: 'geojson', data: EMPTY_LINES });
			map.addLayer({
				id: ring.id,
				type: 'line',
				source: ring.id,
				paint: { 'line-color': brand.ring, 'line-width': 1, 'line-opacity': ring.percent / 100 }
			});
		}
		map.addSource('terminator', { type: 'geojson', data: EMPTY_LINES });
		map.addLayer({
			id: 'terminator',
			type: 'line',
			source: 'terminator',
			paint: { 'line-color': '#5cc8ff', 'line-width': 1, 'line-opacity': 0.2 }
		});
	}

	/** Advance everything to the timeline frame at `index`. */
	function renderFrame(map: MlMap, index: number) {
		const frame = shadowFrames[index];
		const date = new Date(frame.time);
		const center = { lat: frame.lat, lon: frame.lon };
		const model = computeShadowModel(center, sunMoonECEF(date));

		// feed the shadow shader (axis + coverage profile)
		shadowState.center = model.center;
		shadowState.axis = model.axis;
		shadowState.sunDir = model.sunDir;
		shadowState.rMax = model.rMax;
		shadowState.profile = model.profileBytes;
		shadowState.profileVersion++;
		shadowState.ready = true;
		map.triggerRepaint();

		// analytic iso-rings: cylinder (radius for the coverage level) ∩ sphere
		for (const ring of ISO_RINGS) {
			const radius = radiusForCoverage(model, ring.level);
			(map.getSource(ring.id) as GeoJSONSource).setData(radius == null ? EMPTY_LINES : isoRing(model, radius));
		}

		// day/night great circle
		(map.getSource('terminator') as GeoJSONSource | undefined)?.setData(terminatorLine(model.sunDir));

		// header readout
		clockUtc = formatUtc(frame.time);
		umbraCenterText = `${center.lat.toFixed(2)}°, ${center.lon.toFixed(2)}°`;
	}

	function onScrub(event: Event) {
		const target = event.currentTarget as HTMLInputElement;
		frameIndex = +target.value;
		showFrame(frameIndex);
	}
</script>

<section class="block a2">
	<div class="block-head">
		<h2>{$t('a2.title')}</h2>
		<span class="eyebrow">12.08.2026</span>
	</div>
	<p class="sub">{$t('a2.subtitle')}</p>

	<div class="map-wrap bleed">
		<div class="map" bind:this={mapContainer}></div>
		{#if !mapReady}<div class="map-loading">{$t('a2.loading')}</div>{/if}
	</div>

	<div class="panel">
		<div class="row">
			<div class="clock tnum">{clockUtc}<small> UTC</small></div>
			<input
				type="range"
				min="0"
				max={shadowFrames.length - 1}
				step="1"
				value={frameIndex}
				oninput={onScrub}
				aria-label="{$t('a2.title')} — {formatUtc(timelineStart)}–{formatUtc(timelineEnd)} UTC"
			/>
		</div>
		<div class="meta tnum">
			{$t('a2.core')} @ {umbraCenterText} · {formatUtc(timelineStart)}–{formatUtc(timelineEnd)} UTC
		</div>
		<div class="legend">
			<span class="lbl">{$t('a2.current_shadow')}:</span>
			{#each ISO_RINGS as ring (ring.id)}
				<span style="color:var(--accent-2);opacity:{ring.percent / 100}"><i></i>{ring.percent} %</span>
			{/each}
			<span style="color:var(--accent);opacity:.7"><i></i>{$t('a2.path')}</span>
		</div>
	</div>
</section>

<style>
	.sub {
		color: var(--muted);
		font-size: 0.9rem;
		margin: 2px 0 14px;
	}
	.map-wrap {
		position: relative;
		overflow: hidden;
		background: var(--bg);
	}
	.map {
		height: min(64vh, 480px);
		background: var(--bg);
	}
	.map-loading {
		position: absolute;
		inset: 0;
		display: grid;
		place-items: center;
		color: var(--muted);
		pointer-events: none;
	}
	.panel {
		margin-top: 12px;
	}
	.row {
		display: flex;
		align-items: center;
		gap: 12px;
	}
	.clock {
		font-weight: 700;
		font-size: 1.1rem;
	}
	.clock small {
		font-weight: 400;
		opacity: 0.6;
	}
	input[type='range'] {
		flex: 1;
		accent-color: var(--accent);
	}
	.meta {
		color: var(--muted);
		font-size: 0.8rem;
		margin-top: 8px;
	}
	.legend {
		display: flex;
		flex-wrap: wrap;
		gap: 12px;
		align-items: center;
		margin-top: 8px;
		font-size: 0.8rem;
	}
	.legend .lbl {
		color: var(--muted);
	}
	.legend span {
		display: flex;
		align-items: center;
		gap: 6px;
	}
	.legend i {
		width: 20px;
		height: 0;
		border-top: 2px solid currentColor;
		display: inline-block;
	}
	/* ---- MapLibre controls, restyled for the dark map ---- */
	:global(.a2 .maplibregl-ctrl-group) {
		background: color-mix(in oklab, var(--bg-2) 88%, transparent);
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		overflow: hidden;
		box-shadow: 0 2px 12px rgba(0, 0, 0, 0.45);
		backdrop-filter: blur(6px);
	}
	:global(.a2 .maplibregl-ctrl-group button) {
		width: 32px;
		height: 32px;
		background: transparent;
	}
	:global(.a2 .maplibregl-ctrl-group button + button) {
		border-top: 1px solid var(--border);
	}
	:global(.a2 .maplibregl-ctrl-group button:hover) {
		background: var(--surface-2);
	}
	:global(.a2 .maplibregl-ctrl-group button:focus-visible) {
		outline: 2px solid var(--accent);
		outline-offset: -2px;
	}
	/* icons are dark SVG background-images — invert them to read on the dark buttons */
	:global(.a2 .maplibregl-ctrl-group button .maplibregl-ctrl-icon) {
		filter: invert(1) brightness(1.1) opacity(0.75);
	}
	:global(.a2 .maplibregl-ctrl-group button:hover .maplibregl-ctrl-icon) {
		filter: invert(1) brightness(1.1);
	}
	:global(.a2 .maplibregl-ctrl-group button:disabled .maplibregl-ctrl-icon) {
		filter: invert(1) opacity(0.28);
	}
	/* attribution pill */
	:global(.a2 .maplibregl-ctrl-attrib) {
		background: color-mix(in oklab, var(--bg-2) 70%, transparent);
		color: var(--muted);
	}
	:global(.a2 .maplibregl-ctrl-attrib a) {
		color: var(--muted);
	}
	:global(.a2 .maplibregl-ctrl-attrib-button) {
		filter: invert(1) opacity(0.6);
	}
</style>
