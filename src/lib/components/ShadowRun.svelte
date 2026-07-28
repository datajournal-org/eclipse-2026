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
	import { t, fmt } from '$lib/i18n';
	import { userLocation } from '$lib/stores/location';
	import { readBrandColors } from '$lib/brand';
	import { sunMoonECEF } from '$lib/eclipse';
	import { shadowFrames, timelineStart, timelineEnd } from '$lib/shadow-globe/shadowPath';
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
	import { CITY_LABEL_GLYPHS, CITY_LABEL_SOURCE, CITY_LABEL_LAYERS } from '$lib/shadow-globe/cityLabels';

	const SATELLITE_TILES = 'https://tiles.versatiles.org/tiles/satellite/{z}/{x}/{y}';
	// `zoom` here is only what the map is constructed with; the real opening zoom comes from the
	// FRAME_BOUNDS fit below, which reads the stage. It stays as the fallback if that fit ever fails.
	const INITIAL_VIEW = { center: [-18, 50] as [number, number], zoom: 1.21 };
	const TERMINATOR_OPACITY = 0.35;

	/**
	 * The region the opening shot must contain: the Atlantic leg of the path, from Greenland/Iceland down
	 * to Iberia and the Balearics. Used as a *zoom* constraint only — see `fitZoom` below.
	 *
	 * Under globe projection the rendered globe is a fixed pixel size for a given zoom: its radius depends
	 * on the zoom and (weakly) on the container's height, and **not at all on its width**. So `INITIAL_VIEW.zoom`
	 * draws a 406 px globe whether the stage is 680 px wide or 390 px — which is why a value framed on a
	 * desktop overflows a phone, clipped left and right.
	 */
	const FRAME_BOUNDS: [[number, number], [number, number]] = [
		[-20, 0],
		[37, 70]
	];

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
	// regular time marks on the slider (every 30 min) — labelled in the viewer's local time zone; tap to jump.
	// Reactive so the clock and the ticks always share the same resolved locale (12h/24h) and time zone.
	const timeTicks = $derived(
		buildTimeGrid({
			start: timelineStart,
			end: timelineEnd,
			len: shadowFrames.length,
			stepMin: 30,
			label: (ms) => $fmt.time(ms)
		})
	);
	let mapContainer: HTMLDivElement;
	let stage: HTMLDivElement; // map + panel wrapper — what goes fullscreen (so the slider stays visible)
	let frameIndex = $state(START_INDEX);
	// Clock label for the current frame — derived, so it re-formats on both scrub and locale change.
	const clock = $derived($fmt.time(shadowFrames[frameIndex].time));
	// Width to reserve for it, so the zone label beside it does not step sideways as the hour gains a
	// digit. Derived alongside `clock` so a locale switch (12h ⇄ 24h) re-measures it.
	const clockCh = $derived($fmt.clockWidthCh(shadowFrames.map((f) => f.time)));
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
					// Fonts for the city labels — nothing else in this style draws text.
					glyphs: CITY_LABEL_GLYPHS,
					sources: {
						sat: {
							type: 'raster',
							tiles: [SATELLITE_TILES],
							tileSize: 512,
							maxzoom: 19,
							attribution: '© <a href="https://versatiles.org/sources/">VersaTiles sources</a>'
						},
						// The vector source behind the city labels (fetched only once a label layer is in zoom
						// range — see cityLabels.ts).
						'versatiles-shortbread': CITY_LABEL_SOURCE
					},
					// Stated rather than relied upon: globe happens to be MapLibre's default, but the whole
					// A2 design (shadow layer, iso rings, the fit below) assumes a sphere, and a changed
					// default would silently turn it into a flat map.
					projection: { type: 'globe' },
					layers: [
						{ id: 'bg', type: 'background', paint: { 'background-color': brand.bg.hex } },
						{ id: 'sat', type: 'raster', source: 'sat', paint: { 'raster-brightness-max': 0.9 } }
					]
				}
			});
			map = m;

			// Shrink the globe on a narrow stage so it is never clipped, using MapLibre's own bounds fit —
			// which, unlike a fixed zoom, reads the container. Three things this has to get right:
			//
			//  · Only the ZOOM is taken from it. `fitBounds` also recentres, and derives the centre in
			//    mercator space, so FRAME_BOUNDS' mid-latitude lands at 59.7°N, not the 50°N this shot is
			//    framed on.
			//  · `maxZoom` pins the wide case to the hand-tuned value, so anything from a tablet up stays
			//    pixel-identical to before and only phones get a smaller globe.
			//  · It must run AFTER the style resolves. `cameraForBounds` dispatches to a per-projection
			//    camera helper, and until the style applies, the map is still mercator — the fit then comes
			//    back ~1.26 for a phone (a mercator answer), the cap swallows it, and the globe is clipped
			//    exactly as before. `style.load` is early enough that no frame has been painted.
			const applyFit = () => {
				// Padding proportional to the stage, not a fixed pixel count: the same 8 px that leaves a
				// sensible margin on a 390 px phone is invisible on a 1120 px desktop, and a value large
				// enough for the desktop eats a phone's globe. 4% of the shortest side holds the globe at a
				// steady ~0.9 of the frame across every breakpoint.
				const shortest = Math.min(mapContainer.clientWidth, mapContainer.clientHeight);
				const fit = m.cameraForBounds(FRAME_BOUNDS, { padding: Math.round(shortest * 0.04) });
				if (!fit) return;
				m.jumpTo({ center: INITIAL_VIEW.center, zoom: fit.zoom });
				// Whatever FRAME_BOUNDS asks for, the WHOLE globe must fit the stage width — tight bounds
				// zoom in far enough to clip the sphere on a phone, which reads as a broken page rather
				// than a framing choice. Measure the on-screen diameter the same way the e2e contract does
				// (project a point 90° east of centre) and clamp: projection scale is linear in 2^zoom, so
				// one measured correction is exact.
				const c = m.getCenter();
				const mid = m.project([c.lng, c.lat]);
				const edge = m.project([c.lng + 90, c.lat]);
				const diameter = 2 * Math.hypot(edge.x - mid.x, edge.y - mid.y);
				const maxDiameter = mapContainer.clientWidth * 0.96;
				if (diameter > maxDiameter) m.setZoom(m.getZoom() - Math.log2(diameter / maxDiameter));
			};
			if (m.isStyleLoaded()) applyFit();
			else m.once('style.load', applyFit);

			if (new URLSearchParams(location.search).has('debug')) Object.assign(window, { __map: m });
			// Surface style/tile/WebGL errors that would otherwise be swallowed (and can stall loading).
			m.on('error', (e) => console.error('[A2] map error:', (e as { error?: unknown }).error ?? e));
			// Test hook: the end-to-end suite waits on this instead of guessing at a timeout or watching
			// for a visual side effect. `idle` fires once the style, sources and first frame are all done.
			m.once('idle', () => mapContainer.setAttribute('data-map-ready', 'true'));
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
					// City names, above the shadow so they stay readable inside the darkened region. Zoom
					// gating comes from the layers' minzooms (capitals from 5, towns from 9 — cityLabels.ts).
					for (const layer of CITY_LABEL_LAYERS) m.addLayer(layer);
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

<section class="block a2 wide">
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
				<span class="clock"
					><span style:--clock-ch={clockCh} class="clock-time">{clock}</span>
					<small>{$fmt.zone(timelineStart)}</small></span
				>
			</div>
			<TimeScrubber
				value={frameIndex}
				max={shadowFrames.length - 1}
				ariaLabel="{$t('a2.title')} — {$fmt.time(timelineStart)}–{$fmt.time(timelineEnd)} {$fmt.zone(
					timelineStart
				)}"
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
	/* Fullscreen wraps map + time slider so the slider stays visible. */
	.a2-stage:fullscreen {
		display: flex;
		flex-direction: column;
		width: 100%;
		height: 100%;
		background: #000;

		.stage {
			margin-inline: 0;
			flex: 1;
			min-height: 0;
		}
		.stage-canvas {
			height: 100%;
			background: #000;
		}
		.timebar {
			margin: 0;
			align-self: center;
			width: min(760px, 100%);
			padding: 12px var(--edge) 16px;
		}
	}
	/* the clock carries a small local time-zone note, e.g. "MESZ" (A2 only) */
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
