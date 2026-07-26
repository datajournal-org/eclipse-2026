<!--
  A2 — Shadow run. A MapLibre globe: the totality corridor + live iso-coverage rings + Moon-shadow,
  driven by a time slider. The geometry/rendering lives in $lib/shadow-globe/*:
    · shadowPath          — precomputed timeline frames
    · shadowProfile       — per-frame shadow axis + 1D coverage profile (LUT)
    · moonShadowLayer     — WebGL layer: per-pixel day/night + Moon-shadow darkening from the profile texture
    · isoLinesLayer       — pole- & antimeridian-correct custom layer (corridor band + iso rings + terminator)
    · isoRing / corridor  — analytic rings (cylinder ∩ sphere) + the precomputed totality corridor edges
    · isoLabels           — DOM percent labels;  overlayToggleControl — the show/hide button
  This component just wires those onto the map and the slider UI.
-->
<script lang="ts">
	import { onMount } from 'svelte';
	import { get } from 'svelte/store';
	import 'maplibre-gl/dist/maplibre-gl.css';
	import type { Map as MlMap, Marker as MlMarker } from 'maplibre-gl';
	import { t } from '$lib/i18n';
	import { userLocation } from '$lib/stores/location';
	import { readBrandColors } from '$lib/brand';
	import { sunMoonECEF } from '$lib/eclipse';
	import { shadowFrames, timelineStart, timelineEnd, formatUtc } from '$lib/shadow-globe/shadowPath';
	import { computeShadowModel, radiusForCoverage, type ShadowModel } from '$lib/shadow-globe/shadowProfile';
	import { isoRing, terminatorLine } from '$lib/shadow-globe/isoRing';
	import { createMoonShadowLayer, type ShadowState } from '$lib/shadow-globe/moonShadowLayer';
	import {
		createIsoLinesLayer,
		linePrimitiveFromSegments,
		fillStripPrimitive,
		type IsoLinesState,
		type LinePrimitive
	} from '$lib/shadow-globe/isoLinesLayer';
	import { corridorEdges } from '$lib/shadow-globe/corridor';
	import { OverlayToggleControl } from '$lib/shadow-globe/overlayToggleControl';
	import { IsoLabels } from '$lib/shadow-globe/isoLabels';
	import TimeScrubber from '$lib/components/TimeScrubber.svelte';
	import { buildTimeGrid } from '$lib/components/timeScrubber';
	import { loadMaplibre } from '$lib/maplibre';

	const SATELLITE_TILES = 'https://tiles.versatiles.org/tiles/satellite/{z}/{x}/{y}';
	const INITIAL_VIEW = { center: [-18, 50] as [number, number], zoom: 1.21 };
	const TERMINATOR_OPACITY = 0.35;

	// Coverage rings drawn live around the current shadow. `level` = obscuration threshold (0..1);
	// `percent` drives both the ring opacity and the label text.
	const ISO_RINGS = [
		{ percent: 20, level: 0.2, opacity: 0.1 },
		{ percent: 40, level: 0.4, opacity: 0.2 },
		{ percent: 60, level: 0.6, opacity: 0.3 },
		{ percent: 80, level: 0.8, opacity: 0.4 },
		{ percent: 100, level: 0.999, opacity: 0.5 }
	];

	// Shared state the WebGL shadow layer reads each frame: the shadow axis + the 1D coverage profile
	// (a float LUT). `profileVersion` bumps so the texture re-uploads.
	const shadowState: ShadowState = {
		center: [0, 0, 1],
		axis: [0, 0, 1],
		sunDir: [0, 0, 1],
		rMax: 0.5,
		profile: null,
		profileVersion: 0,
		ready: false
	};

	// The corridor band + iso rings + terminator render through a custom layer (projectTile) so they
	// stay correct over the poles (GeoJSON line/fill layers clamp at ±85°).
	const isoLinesState: IsoLinesState = { lines: [], version: 0, ready: false, visible: true };
	const isoLabels = new IsoLabels(ISO_RINGS);

	let corridorBand: LinePrimitive | null = null; // the static totality corridor fill (set on mount)
	let currentModel: ShadowModel | null = null; // last frame's shadow model — re-place labels on view change
	let labelsVisible = true;

	// ---- reactive UI state ----
	const START_INDEX = Math.floor(shadowFrames.length / 2);
	// regular UTC time marks on the slider (17:00, 17:30, …) — tap to jump to that instant
	const timeTicks = buildTimeGrid({
		start: timelineStart,
		end: timelineEnd,
		len: shadowFrames.length,
		stepMin: 30,
		label: formatUtc
	});
	let mapContainer: HTMLDivElement;
	let stage: HTMLDivElement; // map + panel wrapper — what goes fullscreen (so the slider stays visible)
	let frameIndex = $state(START_INDEX);
	let clockUtc = $state(formatUtc(shadowFrames[START_INDEX].time));
	let mapReady = $state(false);
	let loadError = $state(false); // dynamic-import / map init failed → show a message instead of a stuck loader
	/** Set once the map has loaded; renders the frame at `index`. */
	let showFrame: (index: number) => void = () => {};

	// User-location pin — managed reactively by the $effect below, independent of the overlay toggle.
	let mapInstance: MlMap | undefined;
	let MarkerCtor: typeof import('maplibre-gl').Marker | undefined;
	let userMarker: MlMarker | null = null;

	onMount(() => {
		let map: MlMap | undefined;
		let disposed = false;
		const brand = readBrandColors();

		/** Advance everything to the timeline frame at `index`. */
		function renderFrame(m: MlMap, index: number) {
			const frame = shadowFrames[index];
			const model = computeShadowModel(sunMoonECEF(new Date(frame.time)));

			// feed the shadow shader (axis + coverage profile)
			shadowState.center = model.center;
			shadowState.axis = model.axis;
			shadowState.sunDir = model.sunDir;
			shadowState.rMax = model.rMax;
			shadowState.profile = model.coverage;
			shadowState.profileVersion++;
			shadowState.ready = true;
			m.triggerRepaint();

			// Reference overlay → LinePrimitives for the pole- & antimeridian-correct custom layer. Order:
			// day/night terminator (bottom), corridor band, then the iso rings on top.
			const lines: LinePrimitive[] = [];
			lines.push(
				linePrimitiveFromSegments(
					terminatorLine(model.sunDir).geometry.coordinates,
					brand.accent2.rgb,
					TERMINATOR_OPACITY
				)
			);
			if (corridorBand) lines.push(corridorBand);
			for (const ring of ISO_RINGS) {
				const radius = radiusForCoverage(model, ring.level);
				if (radius == null) continue;
				lines.push(
					linePrimitiveFromSegments(isoRing(model, radius).geometry.coordinates, brand.accent.rgb, ring.opacity)
				);
			}
			isoLinesState.lines = lines;
			isoLinesState.version++;
			isoLinesState.ready = true;

			currentModel = model;
			isoLabels.update(m, currentModel, labelsVisible);
			clockUtc = formatUtc(frame.time);
		}

		(async () => {
			const maplibregl = await loadMaplibre().catch((err) => {
				console.error('[A2] failed to load maplibre-gl', err);
				loadError = true;
				return null;
			});
			if (!maplibregl || disposed) return;

			corridorBand = fillStripPrimitive(corridorEdges.north, corridorEdges.south, brand.accent.rgb, 0.1);
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
						{ id: 'bg', type: 'background', paint: { 'background-color': brand.bg.hex } },
						{ id: 'sat', type: 'raster', source: 'sat', paint: { 'raster-brightness-max': 0.9 } }
					]
				}
			});
			map = m;
			if (new URLSearchParams(location.search).has('debug')) Object.assign(window, { __map: m });
			// Surface style/tile/WebGL errors that would otherwise be swallowed (and can stall loading).
			m.on('error', (e) => console.error('[A2] map error:', (e as { error?: unknown }).error ?? e));
			m.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'top-right');
			m.addControl(new maplibregl.FullscreenControl({ container: stage }), 'top-right');

			// Toggle the whole reference overlay (corridor + rings + terminator + labels) on/off.
			let overlayVisible = true;
			const overlayControl = new OverlayToggleControl({
				label: get(t)('a2.toggle_overlay'),
				active: overlayVisible,
				onToggle: () => {
					overlayVisible = !overlayVisible;
					isoLinesState.visible = overlayVisible;
					labelsVisible = overlayVisible;
					isoLabels.update(m, currentModel, labelsVisible);
					m.triggerRepaint();
					overlayControl.setActive(overlayVisible);
				}
			});
			m.addControl(overlayControl, 'top-right');

			m.on('load', () => {
				// The base globe is up → reveal it (and enable the location pin) even if the reference overlay
				// below fails to initialise, so a hiccup degrades gracefully instead of hanging the loader.
				mapInstance = m;
				MarkerCtor = maplibregl.Marker;
				mapReady = true;
				try {
					m.setProjection({ type: 'globe' });
					m.addLayer(createMoonShadowLayer(shadowState)); // darkening, under the reference lines
					m.addLayer(createIsoLinesLayer(isoLinesState)); // corridor + iso rings + terminator
					isoLabels.attach(m, maplibregl.Marker, INITIAL_VIEW.center);
					m.on('move', () => isoLabels.update(m, currentModel, labelsVisible)); // labels track viewport-down
					showFrame = (index) => renderFrame(m, index);
					showFrame(frameIndex);
				} catch (err) {
					console.error('[A2] reference overlay setup failed', err);
				}
			});
		})().catch((err) => {
			console.error('[A2] globe init failed', err);
			loadError = true;
		});

		return () => {
			disposed = true;
			isoLabels.destroy();
			userMarker?.remove();
			userMarker = null;
			map?.remove();
		};
	});

	// Pin the user's chosen location on the globe: create it, move it when it changes, remove it when cleared.
	$effect(() => {
		const loc = $userLocation;
		if (!mapReady || !mapInstance || !MarkerCtor) return;
		if (!loc) {
			userMarker?.remove();
			userMarker = null;
			return;
		}
		if (!userMarker) {
			const el = document.createElement('div');
			el.className = 'user-pin';
			userMarker = new MarkerCtor({ element: el }).setLngLat([loc.lon, loc.lat]).addTo(mapInstance);
		} else {
			userMarker.setLngLat([loc.lon, loc.lat]);
		}
		userMarker.getElement().title = loc.name ?? '';
	});
</script>

<section class="block a2">
	<div class="block-head">
		<h2>{$t('a2.title')}</h2>
		<span class="eyebrow">12.08.2026</span>
	</div>
	<p class="sub">{$t('a2.subtitle')}</p>

	<div class="a2-stage" bind:this={stage}>
		<div class="stage bleed">
			<div class="stage-canvas" bind:this={mapContainer}></div>
			{#if loadError}
				<div class="stage-loading">{$t('a2.load_error')}</div>
			{:else if !mapReady}
				<div class="stage-loading">{$t('a2.loading')}</div>
			{/if}
		</div>

		<div class="timebar">
			<div class="readout tnum">
				<span class="clock">{clockUtc} <small>UTC</small></span>
			</div>
			<TimeScrubber
				value={frameIndex}
				max={shadowFrames.length - 1}
				ariaLabel="{$t('a2.title')} — {formatUtc(timelineStart)}–{formatUtc(timelineEnd)} UTC"
				ticks={timeTicks}
				onscrub={(i) => {
					frameIndex = i;
					showFrame(i);
				}}
			/>
		</div>
	</div>
</section>

<style>
	/* media height for the shared global .stage-canvas */
	.stage {
		--stage-h: min(64vh, 480px);
	}
	/* Fullscreen wraps map + time slider so the slider stays visible. */
	.a2-stage:fullscreen {
		display: flex;
		flex-direction: column;
		width: 100%;
		height: 100%;
		background: #000;

		& .stage {
			margin-inline: 0;
			flex: 1;
			min-height: 0;
		}
		& .stage-canvas {
			height: 100%;
			background: #000;
		}
		& .timebar {
			margin: 0;
			align-self: center;
			width: min(760px, 100%);
			padding: 12px var(--edge) 16px;
		}
	}
	/* the clock carries a small "UTC" note (A2 only) */
	.clock small {
		font-weight: 400;
		opacity: 0.6;
	}
	/* A2-only MapLibre DOM (added outside the component tree). Shared map chrome — control buttons,
	   attribution, the .user-pin marker — lives in styles/map.css; only the globe's own bits are here. */
	:global {
		.a2 {
			/* overlay-toggle button uses an inline (light) SVG rather than an inverted background image
			   (centring comes from the shared button rule in styles/map.css) */
			.a2-overlay-toggle {
				color: #eef2f8;

				svg {
					width: 17px;
					height: 17px;
					opacity: 0.75;
				}
				&:hover svg {
					opacity: 1;
				}
				&.is-off svg {
					opacity: 0.5;
				}
			}

			/* percent labels are DOM markers (added outside the component tree) */
			.iso-label {
				font:
					700 11px/1 system-ui,
					-apple-system,
					sans-serif;
				color: var(--accent);
				white-space: nowrap;
				pointer-events: none;
				text-shadow:
					0 0 2px color-mix(in oklab, var(--bg) 90%, transparent),
					0 0 2px color-mix(in oklab, var(--bg) 90%, transparent);
				/* own compositor layer → moving the marker while rotating is composited, not repainted */
				will-change: transform;
			}
		}
	}
</style>
