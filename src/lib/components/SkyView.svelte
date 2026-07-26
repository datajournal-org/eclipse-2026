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
	import { localCircumstances } from '$lib/eclipse';
	import { destPoint } from '$lib/shadow-globe/vec3';
	import type { SunState } from '$lib/skyview/sunLayer';
	import { eclipseGeometry } from '$lib/skyview/eclipseGeometry';
	import { cssRgb, veilColour, loupeSkyCss } from '$lib/skyview/colors';
	import { bridgeSegments } from '$lib/skyview/overlay';
	import { buildMapStyle, addSceneLayers, sunArcEnvelope } from '$lib/skyview/mapSetup';
	import { createCameraController } from '$lib/skyview/cameraController';
	import { environment, DUSK_HEX } from '$lib/skyview/environment';
	import { computeFraming } from '$lib/skyview/framing';
	import { SKY_PALETTE, ECLIPSE_DATE } from '$lib/config';
	import { DEG_TO_RAD as D2R } from '$lib/constants';

	let mapContainer: HTMLDivElement;
	let ready = $state(false);
	let clock = $state('--:--');
	let altTxt = $state('–');
	let azTxt = $state('–');
	let obscTxt = $state('–');
	let frameIndex = $state(0);
	let frameMax = $state(1);
	// A) loupe inset crescent + B) Sun locator ring & leader line
	const LOUPE_R = 32; // loupe Sun-disc radius in SVG units (viewBox is -50..50 → leaves sky margin around it)
	let pointerVisible = $state(false); // Sun above the horizon AND on-screen (locator ring)
	let tangentVisible = $state(false); // ...and far enough from the loupe to draw the tangent lines
	let crescent = $state({ x: 0, y: 0, r: 0 }); // loupe Moon-disc (the crescent cut-out), SVG units
	let loupeSky = $state<string>(SKY_PALETTE.sky); // loupe background = the sky colour behind the real Sun
	let coronaSize = $state(0); // corona overlay size in loupe viewBox units (image Moon 270px → loupe Moon)
	let coronaOpacity = $state(0); // corona fades in only at totality (obscuration → 1)
	let locatorEl: HTMLDivElement;
	let leaderA: SVGLineElement;
	let leaderB: SVGLineElement;
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
			const maplibregl = (await import('maplibre-gl')).default;
			const { colorful } = await import('@versatiles/style');
			if (disposed) return;

			const lc = localCircumstances(LAT, LON);
			// 30 min of padding on each side of first/last contact, so the slider shows the run-up and wind-down.
			const PAD = 30 * 60 * 1000;
			const tStart = (lc?.partialBegin?.time ?? new Date(ECLIPSE_DATE + 'T16:30:00Z')).getTime() - PAD;
			const tEnd = (lc?.partialEnd?.time ?? new Date(ECLIPSE_DATE + 'T19:00:00Z')).getTime() + PAD;
			const N = 240;
			const times = Array.from({ length: N + 1 }, (_, i) => tStart + ((tEnd - tStart) * i) / N);
			frameMax = N;

			const sun: SunState = {
				center: [0, 0, 0, 1],
				moon: [0, 0],
				moonR: 1,
				angRad: 0,
				visible: false,
				screen: null
			};
			const SUN_DIST = 30000; // metres: far out in the sky (parallax negligible; the Sun reads at infinity)

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
			// Horizontal drag orbits the camera around the marker (handlers below); disable MapLibre's own
			// pan/rotate/zoom so they don't fight it. Pitch/height never change → no >90° bug.
			m.dragPan.disable();
			m.dragRotate.disable();
			m.scrollZoom.disable();
			m.doubleClickZoom.disable();
			m.touchZoomRotate.disable();
			m.keyboard.disable();

			m.on('load', () => {
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

				const EYE = 1.7; // eye height used to place the Sun disc above the ground

				function update() {
					const date = new Date(times[frameIndex]);
					const geo = eclipseGeometry(LAT, LON, date);
					const s = geo.sun;
					const { sunAngR, dx, dy, obsc } = geo;
					sun.moon = [dx / sunAngR, dy / sunAngR];
					sun.moonR = geo.moonAngR / sunAngR;
					sun.angRad = sunAngR * D2R; // real angular radius (rad) → billboard drawn at true size

					const ground = m.queryTerrainElevation([LON, LAT] as [number, number]) ?? 0;
					const eyeAlt = ground + EYE;

					// place the Sun disc along (az, alt), far out in the sky
					const hd = SUN_DIST * Math.cos(s.alt * D2R),
						vd = SUN_DIST * Math.sin(s.alt * D2R);
					const [slng, slat] = destPoint(LAT, LON, s.az, hd);
					const merc = maplibregl.MercatorCoordinate.fromLngLat([slng, slat], eyeAlt + vd);
					sun.center = [merc.x, merc.y, merc.z, 1];

					// The Sun is drawn on top (sunLayer, depth test off): terrain occlusion is intentionally
					// ignored — we don't know the observer's height (street level vs. a rooftop), so a hill that
					// would block the Sun from the ground might not from a roof. Hide it only once it is below
					// the true (sea-level) horizon.
					sun.visible = s.alt > 0;

					// keep the map in sync with the simulated Sun: direction from (az, alt), brightness/colour
					// from the obscuration (same numbers that drive the Sun billboard).
					const env = environment(obsc);
					duskEl.style.opacity = String(env.veil); // dims the whole rendered scene, not the marker
					const veilRgb = veilColour(obsc);
					duskEl.style.background = cssRgb(veilRgb);
					m.setLight({
						anchor: 'map',
						position: [1.15, s.az, 90 - s.alt] as [number, number, number],
						color: env.light,
						intensity: env.intensity
					});
					m.setPaintProperty(
						'hillshade',
						'hillshade-illumination-direction',
						Math.round(((s.az % 360) + 360) % 360)
					);

					clock = get(fmt).time(date);
					altTxt = s.alt.toFixed(1) + '°';
					azTxt = s.az.toFixed(0) + '°';
					obscTxt = (obsc * 100).toFixed(0) + '%';
					// loupe crescent (changes only with time): Moon-disc offset/size in Sun-radius units × R
					crescent = { x: sun.moon[0] * LOUPE_R, y: -sun.moon[1] * LOUPE_R, r: sun.moonR * LOUPE_R };
					loupeSky = loupeSkyCss(s.alt, veilRgb, env.veil);
					// corona overlay (test): the image's Moon (270 of 512 px = radius 135) is mapped onto the loupe
					// Moon disc, and only shown in true totality — obscuration reaches 1 (never at partial locations).
					coronaSize = crescent.r * (512 / 135);
					coronaOpacity = Math.max(0, Math.min(1, (obsc - 0.985) / 0.015));
					m.triggerRepaint();
				}

				setFrame = (i: number) => {
					frameIndex = i;
					update();
				};
				// Start at greatest eclipse — but where it gets very deep (>90%) the peak is near-black, so open
				// instead at the moment the coverage first reaches 90% (on the way in): a livelier first view.
				const peakT = (lc?.peak?.time ?? new Date(ECLIPSE_DATE + 'T18:08:00Z')).getTime();
				const peakFrame = Math.round(((peakT - tStart) / (tEnd - tStart)) * N);
				const obscAt = (t: number) => eclipseGeometry(LAT, LON, new Date(t)).obsc;
				const START_OBSC = 0.9;
				frameIndex = peakFrame;
				if ((lc?.obscuration ?? 0) > START_OBSC) {
					for (let i = 0; i <= peakFrame; i++) {
						if (obscAt(times[i]) >= START_OBSC) {
							frameIndex = i;
							break;
						}
					}
				}
				// A + B overlay: keep the Sun locator marker + the loupe's two connector lines glued to the tiny
				// real Sun each rendered frame (the camera can move without a scrub). The loupe crescent updates
				// in update(); the connectors' geometry lives in skyview/overlay.ts.
				m.on('render', () => {
					const s = sun.screen;
					const w = mapContainer.clientWidth,
						h = mapContainer.clientHeight;
					const onScreen = !!s && sun.visible && s[0] >= 0 && s[0] <= w && s[1] >= 0 && s[1] <= h;
					pointerVisible = onScreen;
					if (!onScreen || !s) {
						tangentVisible = false;
						return;
					}
					if (locatorEl) locatorEl.style.transform = `translate(${s[0]}px, ${s[1]}px) translate(-50%, -50%)`;

					const segs = bridgeSegments(s[0], s[1]);
					if (!segs || !leaderA || !leaderB) {
						tangentVisible = false;
						return;
					}
					const lines = [leaderA, leaderB];
					segs.forEach((seg, i) => {
						lines[i].setAttribute('x1', String(seg.x1));
						lines[i].setAttribute('y1', String(seg.y1));
						lines[i].setAttribute('x2', String(seg.x2));
						lines[i].setAttribute('y2', String(seg.y2));
					});
					tangentVisible = true;
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
			});
		})();

		return () => {
			disposed = true;
			detachDrag?.();
			map?.remove();
		};
	});
	function onScrub(e: Event) {
		setFrame(+(e.currentTarget as HTMLInputElement).value);
	}
</script>

<section class="block b3">
	<div class="block-head">
		<h2>{$t('b3.title')}</h2>
		<span class="eyebrow">B3</span>
	</div>
	<p class="sub">{$t('b3.subtitle')}</p>

	<div class="stage bleed">
		<div class="stage-canvas" bind:this={mapContainer}></div>

		<!-- B: two tangent lines connecting the loupe circle and the locator ring (a magnifier funnel) -->
		<svg class="b3-leader" class:hidden={!tangentVisible} aria-hidden="true">
			<line bind:this={leaderA} />
			<line bind:this={leaderB} />
		</svg>
		<!-- B: locator ring around the real Sun -->
		<div class="b3-locator" class:hidden={!pointerVisible} bind:this={locatorEl} aria-hidden="true"></div>
		<!-- A: loupe inset — the eclipsed Sun's crescent, magnified -->
		<div
			class="b3-loupe"
			class:hidden={!ready}
			aria-hidden="true"
			style:--loupe-sun={SKY_PALETTE.sun}
			style:--loupe-sky={loupeSky}
		>
			<svg viewBox="-50 -50 100 100">
				<circle class="loupe-sun" r={LOUPE_R} />
				<circle class="loupe-moon" cx={crescent.x} cy={crescent.y} r={crescent.r} />
				<image
					href="/corona_512.webp"
					x={-coronaSize / 2}
					y={-coronaSize / 2}
					width={coronaSize}
					height={coronaSize}
					opacity={coronaOpacity}
					preserveAspectRatio="xMidYMid meet"
				/>
			</svg>
		</div>

		{#if !ready}<div class="stage-loading">{$t('b3.loading')}</div>{/if}
	</div>

	<div class="scrubber">
		<div class="row">
			<div class="clock tnum">{clock}</div>
			<input
				type="range"
				min="0"
				max={frameMax}
				step="1"
				value={frameIndex}
				oninput={onScrub}
				aria-label={$t('b3.title')}
			/>
		</div>
		<div class="chips tnum">
			<span>☀ {$t('b3.altitude')} <b>{altTxt}</b></span>
			<span>{$t('b3.azimuth')} <b>{azTxt}</b></span>
			<span>◐ {$t('b3.coverage')} <b>{obscTxt}</b></span>
		</div>
	</div>
</section>

<style>
	/* media height for the shared global .stage-canvas */
	.stage {
		--stage-h: min(60vh, 440px);
	}
	.chips {
		display: flex;
		flex-wrap: wrap;
		gap: 14px;
		margin-top: 8px;
		font-size: 0.86rem;
		color: var(--muted);

		& b {
			color: var(--accent);
		}
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

			/* A) loupe inset (magnified crescent) + B) Sun locator ring & leader line. These sit above the
		   twilight veil, so they stay legible as the eclipse darkens the scene. */
			/* the loupe is a square (same shape as the locator marker), showing the crescent on the same sky
		   colour that is behind the real Sun → reads as a straight magnification of the marked spot. */
			.b3-loupe {
				position: absolute;
				top: 10px;
				left: 10px;
				box-sizing: border-box;
				width: 96px;
				height: 96px;
				border-radius: 0;
				overflow: hidden;
				background: var(--loupe-sky, #8fb4e0);
				border: 2px solid #fff;
				box-shadow: 0 1px 5px rgba(0, 0, 0, 0.5);
				pointer-events: none;

				svg {
					display: block;
					width: 100%;
					height: 100%;
				}
				.loupe-sun {
					fill: var(--loupe-sun);
				}
				.loupe-moon {
					fill: var(--loupe-sky, #8fb4e0); /* the Moon reveals the sky, same as in the scene */
				}
			}
			/* same white rim + shadow as the loupe, only a bit thinner (the loupe is its magnification) */
			.b3-locator {
				position: absolute;
				top: 0;
				left: 0;
				box-sizing: border-box;
				width: 26px;
				height: 26px;
				border: 1px solid #fff;
				border-radius: 0;
				pointer-events: none;
			}
			.b3-leader {
				position: absolute;
				inset: 0;
				width: 100%;
				height: 100%;
				overflow: visible;
				pointer-events: none;
				line {
					stroke: #fff;
					stroke-width: 0.5;
				}
			}
			:is(.b3-loupe, .b3-locator, .b3-leader).hidden {
				display: none;
			}
		}
	}
</style>
