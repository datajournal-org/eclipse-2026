<!-- B3 — "your view of the Sun": a third-person 3D map (VersaTiles terrain + buildings) framed from behind a
     marker at your location toward the Sun's azimuth, with the eclipsed Sun drawn at its real angular size on
     top of the scene. Time slider over the local eclipse window. Ported from an early standalone HTML
     prototype. -->
<script lang="ts">
	import { onMount } from 'svelte';
	import { get } from 'svelte/store';
	import 'maplibre-gl/dist/maplibre-gl.css';
	import type { Map as MlMap } from 'maplibre-gl';
	import { t, fmt } from '$lib/i18n';
	import { userLocation } from '$lib/stores/location';
	import { localCircumstances, sunset } from '$lib/eclipse';
	import type { SunState } from '$lib/skyview/sunLayer';
	import { eclipseGeometry } from '$lib/skyview/eclipseGeometry';
	import { cssRgb, veilColour, loupeSkyCss, loupeGroundCss } from '$lib/skyview/colors';
	import { buildTimeline } from '$lib/skyview/timeline';
	import { buildTimeAxis, type TimeAxis } from '$lib/skyview/timeAxis';
	import TimeScrubber from '$lib/components/TimeScrubber.svelte';
	import { buildMapStyle, addSceneLayers, sunArcEnvelope } from '$lib/skyview/mapSetup';
	import { createCameraController } from '$lib/skyview/cameraController';
	import { placeSun, syncMapLighting } from '$lib/skyview/frameSync';
	import { environment, duskVeil, DUSK_HEX } from '$lib/skyview/environment';
	import { computeFraming } from '$lib/skyview/framing';
	import SkyLoupe from '$lib/components/SkyLoupe.svelte';
	import { loadMaplibre } from '$lib/maplibre';
	import { SKY_PALETTE } from '$lib/config';

	let mapContainer: HTMLDivElement;
	let ready = $state(false);
	let clock = $state('--:--');
	let altTxt = $state('–');
	let azTxt = $state('–');
	let obscTxt = $state('–');
	let frameIndex = $state(0);
	let axis = $state<TimeAxis | null>(null); // event markers for the time slider (built once, in onMount)
	// A) loupe inset crescent + B) Sun locator square & leader lines — rendered by the SkyLoupe child, which
	// exposes place() so the render loop below can glue the overlay to the on-screen Sun each frame.
	const LOUPE_R = 32; // loupe Sun-disc radius in SVG units (viewBox is -50..50 → leaves sky margin around it)
	let crescent = $state({ x: 0, y: 0, r: 0 }); // loupe Moon-disc (the crescent cut-out), SVG units
	let loupeSky = $state<string>(SKY_PALETTE.sky); // loupe background = the sky colour behind the real Sun
	let coronaSize = $state(0); // corona overlay size in loupe viewBox units (image Moon 270px → loupe Moon)
	let coronaOpacity = $state(0); // corona fades in only at totality (obscuration → 1)
	let horizonY = $state(999); // loupe horizon offset (SVG units, +y down); off-frame until the Sun sets
	let loupeGround = $state<string>('#15110d'); // ground silhouette below the loupe horizon
	let loupe = $state<{ place: (screen: [number, number] | null) => void }>();
	let setFrame: (i: number) => void = () => {};

	onMount(() => {
		const loc = get(userLocation);
		if (!loc) return;
		const LAT = loc.lat,
			LON = loc.lon;
		let map: MlMap | undefined;
		let disposed = false;
		let detachDrag: (() => void) | undefined;

		(async () => {
			const mods = await Promise.all([loadMaplibre(), import('@versatiles/style')]).catch((err) => {
				console.error('[B3] failed to load map libraries', err);
				return null;
			});
			if (!mods || disposed) return;
			const [maplibregl, versatiles] = mods;
			const { colorful } = versatiles;

			const lc = localCircumstances(LAT, LON);
			const { N, times, startFrame } = buildTimeline(LAT, LON, lc);
			frameIndex = startFrame;
			// event markers for the slider (labels/times baked here from the current locale + timezone)
			axis = buildTimeAxis({
				lc,
				sunset: sunset(LAT, LON),
				times,
				N,
				t: get(t),
				fmtTime: (d) => get(fmt).time(d)
			});

			const sun: SunState = {
				center: [0, 0, 0, 1],
				moon: [0, 0],
				moonR: 1,
				angRad: 0,
				visible: false,
				screen: null
			};

			// VersaTiles style (labels off, DEM added) + the base land colour the 3D buildings share.
			const { style, landColor } = buildMapStyle(colorful);

			const m = new maplibregl.Map({
				container: mapContainer,
				center: [LON, LAT],
				zoom: 16,
				pitch: 85,
				bearing: 290,
				maxPitch: 85,
				attributionControl: { compact: false },
				style
			});
			map = m;
			// Surface style/terrain/WebGL errors that would otherwise be swallowed (and can stall loading).
			m.on('error', (e) => console.error('[B3] map error:', (e as { error?: unknown }).error ?? e));
			// Test hook: the end-to-end suite waits on this instead of guessing at a timeout or watching
			// for a visual side effect. `idle` fires once the style, sources and first frame are all done.
			m.once('idle', () => mapContainer.setAttribute('data-map-ready', 'true'));
			// Horizontal drag orbits the camera around the marker (handlers below); disable MapLibre's own
			// pan/rotate/zoom so they don't fight it. Pitch/height never change → no >90° bug.
			m.dragPan.disable();
			m.dragRotate.disable();
			m.scrollZoom.disable();
			m.doubleClickZoom.disable();
			m.touchZoomRotate.disable();
			m.keyboard.disable();

			m.on('load', () => {
				try {
					addSceneLayers(m, { sun, landColor });

					// ---- orientation framing: one fixed shot showing the whole Sun arc + the location marker ----
					const { azMin, azMax, altMax } = sunArcEnvelope(LAT, LON, times, N, 8);
					const aspect = (mapContainer.clientWidth || 1) / (mapContainer.clientHeight || 1);
					const framing = computeFraming({ azMin, azMax, altMax }, aspect);
					m.setVerticalFieldOfView(framing.fov);

					// Third-person camera rig + interaction (orbit / dolly-zoom / controls) — see cameraController.ts.
					const cam = createCameraController({
						maplibregl,
						m,
						lat: LAT,
						lon: LON,
						framing,
						altMax,
						label: (key) => get(t)(key)
					});
					detachDrag = cam.detach;

					// twilight veil — dims the whole rendered scene (sky, terrain, buildings, base map) as the
					// eclipse deepens. It lives INSIDE the map's canvas container, appended just BEFORE the marker,
					// so the marker (a UI element, like the A2 globe's) sits above it at full brightness rather than
					// being dimmed with the scene. update() drives its opacity from the obscuration.
					const duskEl = document.createElement('div');
					duskEl.className = 'b3-dusk';
					duskEl.style.background = DUSK_HEX;
					m.getCanvasContainer().appendChild(duskEl);

					// location marker — a DOM marker, exactly like the A2 globe. MapLibre keeps it on the terrain
					// surface at [LON,LAT] every frame; now that the camera height no longer bobs, it holds its
					// screen position as the camera orbits. Shared .user-pin dot (styles/map.css), same as the A2
					// globe. Added after the veil → above it.
					const pin = document.createElement('div');
					pin.className = 'user-pin';
					new maplibregl.Marker({ element: pin }).setLngLat([LON, LAT]).addTo(m);

					// Zoom (+/-) and reset controls — added after the veil/marker, same look as the A2 globe.
					cam.addControls();

					function update() {
						const date = new Date(times[frameIndex]);
						const geo = eclipseGeometry(LAT, LON, date);
						const s = geo.sun;
						placeSun(sun, geo, { maplibregl, m, lat: LAT, lon: LON });

						// keep the map in sync with the simulated Sun: brightness/colour from the obscuration (same
						// numbers that drive the Sun billboard), light + hillshade from its (az, alt).
						const env = environment(geo.obsc);
						// Combine the eclipse dimming with a dusk dimming from the Sun's altitude (screen blend), so the
						// whole scene — terrain, buildings, sky, loupe — also darkens as the Sun sets, not only as it's
						// covered. The eclipse owns the plunge to totality; dusk owns the fade after sunset.
						const veil = 1 - (1 - env.veil) * (1 - duskVeil(s.alt));
						duskEl.style.opacity = String(veil); // dims the whole rendered scene, not the marker
						const veilRgb = veilColour(geo.obsc, s.alt);
						duskEl.style.background = cssRgb(veilRgb);
						syncMapLighting(m, s.az, s.alt, env);

						clock = get(fmt).time(date);
						altTxt = s.alt.toFixed(1) + '°';
						azTxt = s.az.toFixed(0) + '°';
						obscTxt = (geo.obsc * 100).toFixed(0) + '%';
						// loupe crescent (changes only with time): Moon-disc offset/size in Sun-radius units × R
						crescent = { x: sun.moon[0] * LOUPE_R, y: -sun.moon[1] * LOUPE_R, r: sun.moonR * LOUPE_R };
						loupeSky = loupeSkyCss(s.alt, veilRgb, veil);
						// loupe horizon: the Sun sits `s.alt`° above the horizon → the horizon line is that far below
						// the centred Sun, in loupe units (loupeR units = one solar radius = geo.sunAngR°).
						horizonY = (s.alt / geo.sunAngR) * LOUPE_R;
						loupeGround = loupeGroundCss(landColor, veilRgb, veil);
						// corona overlay (test): the image's Moon (270 of 512 px = radius 135) is mapped onto the loupe
						// Moon disc, and only shown in true totality — obscuration reaches 1 (never at partial locations).
						coronaSize = crescent.r * (512 / 135);
						coronaOpacity = Math.max(0, Math.min(1, (geo.obsc - 0.985) / 0.015));
						m.triggerRepaint();
					}

					setFrame = (i: number) => {
						frameIndex = i;
						update();
					};

					// keep the loupe overlay glued to the tiny real Sun each rendered frame (the camera can move
					// without a scrub); SkyLoupe.place() positions the locator + tangent lines from the screen point.
					m.on('render', () => {
						const s = sun.screen;
						const w = mapContainer.clientWidth,
							h = mapContainer.clientHeight;
						const onScreen = !!s && sun.visible && s[0] >= 0 && s[0] <= w && s[1] >= 0 && s[1] <= h;
						loupe?.place(onScreen ? s : null);
					});

					// NOTE: no re-framing on 'idle' — the camera is set once here and never moves on its own
					// again (a later jumpTo would fight the user's panning and appear to teleport the marker).
					m.once('idle', () => {
						cam.applyFraming();
						update();
					});
					cam.applyFraming();
					update();
					ready = true;
				} catch (err) {
					console.error('[B3] scene setup failed', err);
					ready = true;
				}
			});
		})().catch((err) => {
			console.error('[B3] sky view init failed', err);
		});

		return () => {
			disposed = true;
			detachDrag?.();
			map?.remove();
		};
	});
</script>

<section class="block b3">
	<div class="block-head">
		<h2>{$t('b3.title')}</h2>
	</div>
	<p class="sub">{$t('b3.subtitle')}</p>

	<div class="stage bleed">
		<div class="stage-canvas" bind:this={mapContainer}></div>

		<!-- A) loupe inset + B) Sun locator square & tangent leaders; bound so the render loop can drive it -->
		<SkyLoupe
			bind:this={loupe}
			{ready}
			loupeR={LOUPE_R}
			{loupeSky}
			{loupeGround}
			{horizonY}
			{crescent}
			{coronaSize}
			{coronaOpacity}
		/>

		{#if !ready}<div class="stage-loading">{$t('b3.loading')}</div>{/if}
	</div>

	<div class="timebar">
		<div class="readout tnum">
			<span class="clock">{clock}</span>
			<span>☀ {$t('b3.altitude')} <b>{altTxt}</b></span>
			<span>{$t('b3.azimuth')} <b>{azTxt}</b></span>
			<span>◐ {$t('b3.coverage')} <b>{obscTxt}</b></span>
		</div>
		{#if axis}
			<TimeScrubber
				value={frameIndex}
				max={axis.max}
				ariaLabel={$t('b3.title')}
				ticks={axis.ticks}
				band={axis.band}
				sunsetFrac={axis.sunsetFrac}
				sunsetNote={axis.sunsetNote}
				onscrub={(i) => setFrame(i)}
			/>
		{/if}
	</div>
</section>

<style>
	/* media height for the shared global .stage-canvas */
	.stage {
		--stage-h: min(60vh, 440px);
	}
	/* B3-only MapLibre DOM (added outside the component tree). Shared map chrome (controls, attribution,
	   the .user-pin marker) lives in styles/map.css; only the twilight veil is B3-specific. */
	:global {
		.b3 {
			/* twilight veil — inside the map's canvas container, under the marker: dims the rendered scene but
		   not the location marker above it. */
			.b3-dusk {
				position: absolute;
				inset: 0;
				pointer-events: none;
				transition: opacity 150ms linear;
			}
		}
	}
</style>
