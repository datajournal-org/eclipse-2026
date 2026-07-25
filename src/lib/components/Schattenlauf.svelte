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
	import { get } from 'svelte/store';
	import 'maplibre-gl/dist/maplibre-gl.css';
	import { t } from '$lib/i18n';
	import type { Map as MlMap, IControl, GeoJSONSource } from 'maplibre-gl';
	import type { Feature } from 'geojson';
	import { sunMoonECEF, shadowCenter } from '$lib/eclipse';
	import { shadowFrames, timelineStart, timelineEnd, formatUtc } from '$lib/shadow-globe/shadowPath';
	import {
		computeShadowModel,
		radiusForCoverage,
		latLonToUnitVector,
		type ShadowModel
	} from '$lib/shadow-globe/shadowProfile';
	import { isoRing, terminatorLine, labelPoint, umbraGroundPoint } from '$lib/shadow-globe/isoRing';
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
	const TERMINATOR_RGB: [number, number, number] = [0.361, 0.784, 1]; // #5cc8ff (day/night line)

	// Coverage rings drawn live around the current shadow. `level` = obscuration threshold (0..1),
	// `percent` drives both the map opacity and the legend label.
	const ISO_RINGS = [
		{ percent: 20, level: 0.2, opacity: 0.1 },
		{ percent: 40, level: 0.4, opacity: 0.2 },
		{ percent: 60, level: 0.6, opacity: 0.3 },
		{ percent: 80, level: 0.8, opacity: 0.4 },
		{ percent: 100, level: 0.999, opacity: 0.5 }
	];

	// Shared state the WebGL layer reads each frame (see moonShadowLayer.ts): the shadow axis plus
	// the 1D coverage profile (a float LUT). `profileVersion` bumps so the texture re-uploads.
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
	const isoLinesState: IsoLinesState = { lines: [], version: 0, ready: false, visible: true };
	let ringRgb: [number, number, number] = [1, 0.82, 0.5]; // --accent-2; set from tokens on mount
	let corridorBand: LinePrimitive | null = null; // the static totality corridor (set on mount)
	let currentModel: ShadowModel | null = null; // last frame's shadow model — re-place labels on view change

	// Eye / eye-off icons for the overlay toggle (Feather icons, currentColor).
	const EYE_ICON =
		'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>';
	const EYE_OFF_ICON =
		'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>';

	/** A MapLibre control that toggles the reference overlay (corridor + rings + terminator). */
	class OverlayToggleControl implements IControl {
		button?: HTMLButtonElement;
		container?: HTMLDivElement;
		opts: { label: string; active: boolean; onToggle: () => void };
		constructor(opts: { label: string; active: boolean; onToggle: () => void }) {
			this.opts = opts;
		}
		onAdd(): HTMLElement {
			this.container = document.createElement('div');
			this.container.className = 'maplibregl-ctrl maplibregl-ctrl-group';
			const button = document.createElement('button');
			button.type = 'button';
			button.className = 'a2-overlay-toggle';
			button.title = this.opts.label;
			button.setAttribute('aria-label', this.opts.label);
			button.addEventListener('click', () => this.opts.onToggle());
			this.button = button;
			this.container.appendChild(button);
			this.setActive(this.opts.active);
			return this.container;
		}
		setActive(active: boolean) {
			if (!this.button) return;
			this.button.innerHTML = active ? EYE_ICON : EYE_OFF_ICON;
			this.button.classList.toggle('is-off', !active);
			this.button.setAttribute('aria-pressed', String(active));
		}
		onRemove() {
			this.container?.remove();
		}
	}

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
				fadeDuration: 0, // no label cross-fade → percent labels snap with the iso lines, not lag
				attributionControl: { compact: false },
				style: {
					version: 8,
					glyphs: 'https://tiles.versatiles.org/assets/glyphs/{fontstack}/{range}.pbf',
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

			// Toggle the reference overlay (corridor + iso rings + terminator) on/off.
			let overlayVisible = true;
			const overlayControl = new OverlayToggleControl({
				label: get(t)('a2.toggle_overlay'),
				active: overlayVisible,
				onToggle: () => {
					overlayVisible = !overlayVisible;
					isoLinesState.visible = overlayVisible; // corridor + rings + terminator all live here now
					if (m.getLayer('iso-labels'))
						m.setLayoutProperty('iso-labels', 'visibility', overlayVisible ? 'visible' : 'none');
					m.triggerRepaint();
					overlayControl.setActive(overlayVisible);
				}
			});
			m.addControl(overlayControl, 'top-right');

			m.on('load', () => {
				m.setProjection({ type: 'globe' });
				m.addLayer(createMoonShadowLayer(shadowState)); // darkening, under the reference lines
				m.addLayer(createIsoLinesLayer(isoLinesState)); // corridor + iso rings + terminator, pole- & antimeridian-correct

				// Percent labels, re-placed by refreshLabels along the current viewport-down direction (see
				// labelPoint). Empty until the first frame.
				m.addSource('iso-labels', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
				m.addLayer({
					id: 'iso-labels',
					type: 'symbol',
					source: 'iso-labels',
					layout: {
						'text-field': '{percent} %',
						'text-font': ['noto_sans_bold'],
						'text-size': 11,
						'text-anchor': 'top',
						'text-offset': [0, 0.3],
						'text-rotation-alignment': 'viewport',
						'text-pitch-alignment': 'viewport',
						'text-allow-overlap': true
					},
					paint: {
						'text-color': brand.ring,
						'text-opacity': ['get', 'opacity'],
						'text-halo-color': 'rgba(5, 7, 13, 0.9)',
						'text-halo-width': 1.2
					}
				});

				m.on('move', () => refreshLabels(m)); // labels track viewport-down as the globe turns/zooms
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
		shadowState.profile = model.coverage;
		shadowState.profileVersion++;
		shadowState.ready = true;
		map.triggerRepaint();

		// Reference overlay → LinePrimitives for the pole- & antimeridian-correct custom layer. Order:
		// day/night terminator (bottom), corridor band, then the iso rings on top.
		const lines: LinePrimitive[] = [];
		lines.push(linePrimitiveFromSegments(terminatorLine(model.sunDir).geometry.coordinates, TERMINATOR_RGB, 0.35));
		if (corridorBand) lines.push(corridorBand);
		for (const ring of ISO_RINGS) {
			const radius = radiusForCoverage(model, ring.level);
			if (radius == null) continue;
			lines.push(linePrimitiveFromSegments(isoRing(model, radius).geometry.coordinates, ringRgb, ring.opacity));
		}
		isoLinesState.lines = lines;
		isoLinesState.version++;
		isoLinesState.ready = true;

		currentModel = model;
		refreshLabels(map); // percent labels, placed along the current viewport-down direction

		// header readout — umbra ground point if it reaches Earth, else "—"
		const umbra = shadowCenter(date);
		clockUtc = formatUtc(frame.time);
		umbraCenterText = umbra ? `${umbra.lat.toFixed(2)}°, ${umbra.lon.toFixed(2)}°` : '—';
	}

	/** Re-place the percent labels: each ring is anchored where a ray from the umbra centre in the
	 *  current viewport-down direction crosses it. Runs on frame change and on every map move. */
	function refreshLabels(map: MlMap) {
		const source = map.getSource('iso-labels') as GeoJSONSource | undefined;
		if (!source) return;
		const features: Feature[] = [];
		const umbra = currentModel ? umbraGroundPoint(currentModel) : null;
		const down = umbra ? viewportDownDir(map, umbra) : null;
		if (currentModel && down) {
			for (const ring of ISO_RINGS) {
				const radius = radiusForCoverage(currentModel, ring.level);
				if (radius == null) continue;
				const at = labelPoint(currentModel, radius, down);
				if (at)
					features.push({
						type: 'Feature',
						geometry: { type: 'Point', coordinates: at },
						properties: { percent: ring.percent, opacity: ring.opacity }
					});
			}
		}
		source.setData({ type: 'FeatureCollection', features });
	}

	/** The unit tangent at the umbra centre that points straight DOWN in the current viewport. */
	function viewportDownDir(map: MlMap, umbra: [number, number]): [number, number, number] | null {
		const p = map.project(umbra);
		const below = map.unproject([p.x, p.y + 40]);
		const u = latLonToUnitVector(umbra[1], umbra[0]);
		const b = latLonToUnitVector(below.lat, below.lng);
		const proj = b[0] * u[0] + b[1] * u[1] + b[2] * u[2];
		const t: [number, number, number] = [b[0] - proj * u[0], b[1] - proj * u[1], b[2] - proj * u[2]];
		const len = Math.hypot(t[0], t[1], t[2]);
		if (len < 1e-9) return null;
		return [t[0] / len, t[1] / len, t[2] / len];
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
		background: #000;
	}
	.a2-stage:fullscreen .map-wrap {
		margin-inline: 0;
		flex: 1;
		min-height: 0;
	}
	.a2-stage:fullscreen .map {
		height: 100%;
		background: #000;
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
	/* overlay-toggle button uses an inline (light) SVG rather than an inverted background image */
	:global(.a2 .a2-overlay-toggle) {
		display: flex;
		align-items: center;
		justify-content: center;
		color: #eef2f8;
	}
	:global(.a2 .a2-overlay-toggle svg) {
		width: 17px;
		height: 17px;
		opacity: 0.75;
	}
	:global(.a2 .a2-overlay-toggle:hover svg) {
		opacity: 1;
	}
	:global(.a2 .a2-overlay-toggle.is-off svg) {
		opacity: 0.5;
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
