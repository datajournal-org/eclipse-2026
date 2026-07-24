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
	import { sunMoonECEF, shadowCenter } from '$lib/eclipse';
	import { shadowFrames, timelineStart, timelineEnd, formatUtc } from '$lib/shadow-globe/shadowPath';
	import { computeShadowModel, radiusForCoverage } from '$lib/shadow-globe/shadowProfile';
	import { isoRing, terminatorLine, EMPTY_LINES } from '$lib/shadow-globe/isoRing';
	import { createMoonShadowLayer, type ShadowState } from '$lib/shadow-globe/moonShadowLayer';
	import {
		createIsoLinesLayer,
		linePrimitiveFromSegments,
		fillStripPrimitive,
		type IsoLinesState,
		type LinePrimitive
	} from '$lib/shadow-globe/isoLinesLayer';
	import { corridorEdges } from '$lib/shadow-globe/corridorBand';

	type Brand = { bg: string; path: string; ring: string };

	const SATELLITE_TILES = 'https://tiles.versatiles.org/tiles/satellite/{z}/{x}/{y}';
	const INITIAL_VIEW = { center: [-18, 58] as [number, number], zoom: 2.1 };

	// Coverage rings drawn live around the current shadow. `level` = obscuration threshold (0..1),
	// `percent` drives both the map opacity and the legend label.
	const ISO_RINGS = [
		{ percent: 50, level: 0.5, opacity: 0.2 },
		{ percent: 75, level: 0.75, opacity: 0.3 },
		{ percent: 100, level: 0.999, opacity: 0.4 }
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

	// The totality corridor (band) + the iso rings render through a custom layer (projectTile) so they
	// stay correct over the poles (GeoJSON line/fill layers clamp at ±85°).
	const isoLinesState: IsoLinesState = { lines: [], version: 0, ready: false };
	let ringRgb: [number, number, number] = [1, 0.82, 0.5]; // --accent-2; set from tokens on mount
	let corridorBand: LinePrimitive | null = null; // the static totality corridor (set on mount)

	// ---- reactive UI state ----
	const START_INDEX = Math.floor(shadowFrames.length / 2);
	let mapContainer: HTMLDivElement;
	let stage: HTMLDivElement; // map + panel wrapper — what goes fullscreen (so the slider stays visible)
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
			ringRgb = hexToRgb(brand.ring);
			corridorBand = fillStripPrimitive(corridorEdges.north, corridorEdges.south, hexToRgb(brand.path), 0.18);
			const m = new maplibregl.Map({
				container: mapContainer,
				...INITIAL_VIEW,
				scrollZoom: true, // wheel zoom (over the map it takes the scroll; use fullscreen for full control)
				attributionControl: { compact: false },
				style: {
					version: 8,
					sources: {
						sat: {
							type: 'raster',
							tiles: [SATELLITE_TILES],
							tileSize: 512,
							maxzoom: 19,
							attribution: '© <a href="https://versatiles.org/sources/">VersaTiles sources</a>'
						}
					},
					layers: [
						{ id: 'bg', type: 'background', paint: { 'background-color': brand.bg } },
						{ id: 'sat', type: 'raster', source: 'sat', paint: { 'raster-brightness-max': 0.9 } }
					]
				}
			});
			map = m;
			if (new URLSearchParams(location.search).has('debug')) Object.assign(window, { __map: m });
			m.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'top-right');
			m.addControl(new maplibregl.FullscreenControl({ container: stage }), 'top-right');

			m.on('load', () => {
				m.setProjection({ type: 'globe' });
				m.addLayer(createMoonShadowLayer(shadowState)); // darkening, under the reference lines
				addTerminatorLayer(m);
				m.addLayer(createIsoLinesLayer(isoLinesState)); // path + iso rings via projectTile — pole-correct
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
	function readBrandColors(): Brand {
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

	/** '#rrggbb' → [r, g, b] in 0..1, for the WebGL line colour. */
	function hexToRgb(hex: string): [number, number, number] {
		const h = hex.replace('#', '');
		const full = h.length === 3 ? [...h].map((c) => c + c).join('') : h;
		const n = parseInt(full, 16);
		return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
	}

	/** Day/night terminator as a GeoJSON line — it stays below 85°, so it doesn't need the custom
	 *  layer. The path and iso rings are drawn by the pole-correct custom iso-lines layer instead. */
	function addTerminatorLayer(map: MlMap) {
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
		const model = computeShadowModel(sunMoonECEF(date));

		// feed the shadow shader (axis + coverage profile)
		shadowState.center = model.center;
		shadowState.axis = model.axis;
		shadowState.sunDir = model.sunDir;
		shadowState.rMax = model.rMax;
		shadowState.profile = model.profileBytes;
		shadowState.profileVersion++;
		shadowState.ready = true;
		map.triggerRepaint();

		// corridor band + analytic iso-rings → LinePrimitives for the pole-correct custom layer
		const lines: LinePrimitive[] = [];
		if (corridorBand) lines.push(corridorBand);
		for (const ring of ISO_RINGS) {
			const radius = radiusForCoverage(model, ring.level);
			if (radius == null) continue;
			lines.push(linePrimitiveFromSegments(isoRing(model, radius).geometry.coordinates, ringRgb, ring.opacity));
		}
		isoLinesState.lines = lines;
		isoLinesState.version++;
		isoLinesState.ready = true;

		// day/night great circle
		(map.getSource('terminator') as GeoJSONSource | undefined)?.setData(terminatorLine(model.sunDir));

		// header readout — umbra ground point if it reaches Earth, else "—"
		const umbra = shadowCenter(date);
		clockUtc = formatUtc(frame.time);
		umbraCenterText = umbra ? `${umbra.lat.toFixed(2)}°, ${umbra.lon.toFixed(2)}°` : '—';
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

	<div class="a2-stage" bind:this={stage}>
		<div class="map-wrap bleed">
			<div class="map" bind:this={mapContainer}></div>
			{#if !mapReady}<div class="map-loading">{$t('a2.loading')}</div>{/if}
		</div>

		<div class="panel">
			<div class="row">
				<div class="clock tnum">{clockUtc} <small>UTC</small></div>
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
			<div class="legend">
				<span class="lbl">{$t('a2.current_shadow')}:</span>
				{#each ISO_RINGS as ring (ring.percent)}
					<span style="color:var(--accent-2);opacity:{ring.opacity}"><i></i>{ring.percent} %</span>
				{/each}
				<span style="color:var(--accent);opacity:.7"><i></i>{$t('a2.path')}</span>
			</div>
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
	/* Fullscreen wraps map + panel so the time slider stays visible. */
	.a2-stage:fullscreen {
		display: flex;
		flex-direction: column;
		width: 100%;
		height: 100%;
		background: var(--bg);
	}
	.a2-stage:fullscreen .map-wrap {
		margin-inline: 0;
		flex: 1;
		min-height: 0;
	}
	.a2-stage:fullscreen .map {
		height: 100%;
	}
	.a2-stage:fullscreen .panel {
		margin: 0;
		align-self: center;
		width: min(760px, 100%);
		padding: 12px var(--edge) 16px;
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
