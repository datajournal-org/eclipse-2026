<!-- B3 — first-person "your view of the Sun": a tilted 3D map (VersaTiles terrain + buildings) aimed at
     the Sun's azimuth, with the eclipsed Sun drawn as a depth-tested billboard so hills/buildings occlude
     it. Time slider over the local eclipse window. Ported from prototype/b3.html. -->
<script lang="ts">
	import { onMount } from 'svelte';
	import { get } from 'svelte/store';
	import 'maplibre-gl/dist/maplibre-gl.css';
	import type { Map as MlMap } from 'maplibre-gl';
	import { t, fmt } from '$lib/i18n';
	import { userLocation } from '$lib/stores/location';
	import { sunMoonHorizon, localCircumstances } from '$lib/eclipse';
	import { discOverlapFraction } from '$lib/shadow-globe/shadowProfile';
	import { destPoint } from '$lib/shadow-globe/vec3';
	import { createSunLayer, type SunState } from '$lib/skyview/sunLayer';
	import { environment, DUSK_HEX } from '$lib/skyview/environment';
	import { computeFraming } from '$lib/skyview/framing';
	import { SKY_PALETTE, ECLIPSE_DATE } from '$lib/config';
	import { hexToRgb } from '$lib/brand';
	import {
		DEG_TO_RAD as D2R,
		RAD_TO_DEG as R2D,
		norm180,
		AU_KM as AU,
		SUN_RADIUS_KM as RSUN,
		MOON_RADIUS_KM as RMOON,
		EARTH_RADIUS_M
	} from '$lib/constants';

	const ELEV = 'https://tiles.versatiles.org/tiles/elevation/{z}/{x}/{y}';

	let mapContainer: HTMLDivElement;
	let ready = $state(false);
	let clock = $state('--:--');
	let altTxt = $state('–');
	let azTxt = $state('–');
	let obscTxt = $state('–');
	let note = $state('');
	let frameIndex = $state(0);
	let frameMax = $state(1);
	let duskOpacity = $state(0); // twilight veil over the whole scene, grows with the obscuration
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
			const tStart = (lc?.partialBegin?.time ?? new Date(ECLIPSE_DATE + 'T16:30:00Z')).getTime();
			const tEnd = (lc?.partialEnd?.time ?? new Date(ECLIPSE_DATE + 'T19:00:00Z')).getTime();
			const N = 240;
			const times = Array.from({ length: N + 1 }, (_, i) => tStart + ((tEnd - tStart) * i) / N);
			frameMax = N;

			const sun: SunState = { center: [0, 0, 0, 1], moon: [0, 0], moonR: 1, visible: false, opacity: 1 };
			const SUN_DIST = 30000; // metres: far enough that buildings (<1 km) occlude it

			const style = colorful({ baseUrl: 'https://tiles.versatiles.org' });
			style.layers = style.layers.filter((l) => l.type !== 'symbol'); // labels off
			style.sources.dem = { type: 'raster-dem', tiles: [ELEV], tileSize: 512, encoding: 'terrarium' };

			// 3D buildings share the map's own land/background colour → their lit faces match the ground.
			const bgPaint = style.layers.find((l) => l.id === 'background')?.paint as
				{ 'background-color'?: string } | undefined;
			const landColor = bgPaint?.['background-color'] ?? '#f9f4ee';

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
				m.setTerrain({ source: 'dem', exaggeration: 1.0 });
				// Pin the camera to the sea-level-referenced altitude we compute below, instead of clamping the
				// view centre onto the terrain: over mountainous ground that terrain height swings as the camera
				// orbits, which bobbed the whole rig up and down and pushed the marker off-screen.
				m.setCenterClampedToGround(false);
				try {
					m.setSky({
						'sky-color': SKY_PALETTE.sky,
						'horizon-color': SKY_PALETTE.horizon,
						'fog-color': SKY_PALETTE.fog,
						'sky-horizon-blend': 0.7,
						'horizon-fog-blend': 0.6
					});
				} catch {
					/* older sky spec — ignore (the dusk veil still dims the scene) */
				}
				const firstSymbol = m.getStyle().layers.find((l) => l.type === 'symbol')?.id;
				m.addLayer(
					{
						id: 'hillshade',
						type: 'hillshade',
						source: 'dem',
						paint: {
							'hillshade-exaggeration': 0.5,
							'hillshade-illumination-anchor': 'map', // so the direction below tracks the Sun's azimuth
							'hillshade-illumination-direction': 90
						}
					},
					firstSymbol
				);
				for (const id of ['building', 'building:outline']) if (m.getLayer(id)) m.removeLayer(id);
				m.addLayer(
					{
						id: 'buildings-3d',
						type: 'fill-extrusion',
						source: 'versatiles-shortbread',
						'source-layer': 'buildings',
						filter: ['!=', ['get', 'hide_3d'], true],
						paint: {
							'fill-extrusion-color': landColor,
							'fill-extrusion-height': ['coalesce', ['get', 'height'], 3],
							'fill-extrusion-base': ['coalesce', ['get', 'min_height'], 0],
							//'fill-extrusion-opacity': 0.3,
							'fill-extrusion-vertical-gradient': true
						}
					},
					firstSymbol
				);
				m.addLayer(createSunLayer(sun, hexToRgb(SKY_PALETTE.sun)));

				// ---- orientation framing: one fixed shot showing the whole Sun arc + the location marker ----
				// Sun-arc envelope over the eclipse window (coarse sample, azimuth unwrapped).
				let azMin = Infinity,
					azMax = -Infinity,
					altMax = -Infinity,
					prevAz: number | null = null;
				for (let i = 0; i <= N; i += 8) {
					const ss = sunMoonHorizon(LAT, LON, new Date(times[i])).sun;
					let a = ss.az;
					if (prevAz !== null) {
						while (a - prevAz > 180) a -= 360;
						while (a - prevAz < -180) a += 360;
					}
					prevAz = a;
					azMin = Math.min(azMin, a);
					azMax = Math.max(azMax, a);
					altMax = Math.max(altMax, ss.alt);
				}
				const aspect = (mapContainer.clientWidth || 1) / (mapContainer.clientHeight || 1);
				const framing = computeFraming({ azMin, azMax, altMax }, aspect);
				m.setVerticalFieldOfView(framing.fov);

				// Positioned camera: 200 m behind the marker, at a fixed sea-level-referenced altitude so the
				// marker sits ~10% from the bottom. camAlt and the centre elevation are constant across the
				// orbit (only the bearing changes) and centerClampedToGround is off, so the camera height never
				// bobs with the terrain — the marker keeps its screen position as the camera orbits.
				const CAM_DIST = 200; // m behind the marker
				let orbitDeg = 0; // horizontal-drag offset → the camera orbits around the marker
				function applyFraming() {
					const gAlt = m.queryTerrainElevation([LON, LAT] as [number, number]) ?? 0;
					// view-centre depression (deg below horizontal): keep the frame's top just above the Sun's peak
					const c = Math.max(6, Math.min(18, framing.fov / 2 - (altMax + 6)));
					const delta = c + 0.4 * framing.fov; // depression to the marker → 90% down (10% from bottom)
					const camAlt = gAlt + CAM_DIST * Math.tan(delta * D2R);
					const az = framing.meanAz + orbitDeg; // orbit the whole rig around the marker
					const [cLon, cLat] = destPoint(LAT, LON, az + 180, CAM_DIST); // camera behind the marker (circle)
					const centerDist = (camAlt - gAlt) / Math.tan(c * D2R); // ground distance to the view centre
					const [tLon, tLat] = destPoint(cLat, cLon, az, centerDist); // view-centre ground point
					m.jumpTo(
						m.calculateCameraOptionsFromTo(
							new maplibregl.LngLat(cLon, cLat),
							camAlt,
							new maplibregl.LngLat(tLon, tLat),
							gAlt
						)
					);
				}

				// location marker — a DOM marker, exactly like the A2 globe. MapLibre keeps it on the terrain
				// surface at [LON,LAT] every frame; now that the camera height no longer bobs, it holds its
				// screen position as the camera orbits. Dark-red dot + white ring (no pulse), styled by the
				// .b3-user-pin rule below, sharing the globe's --marker token.
				const pin = document.createElement('div');
				pin.className = 'b3-user-pin';
				new maplibregl.Marker({ element: pin }).setLngLat([LON, LAT]).addTo(m);

				// horizontal drag → orbit the camera around the marker (marker stays ~in place; the world turns).
				// Window-level move/up so a drag continues off the canvas.
				const canvas = m.getCanvas();
				canvas.style.cursor = 'grab';
				let dragging = false,
					lastX = 0;
				const startDrag = (x: number) => {
					dragging = true;
					lastX = x;
					canvas.style.cursor = 'grabbing';
				};
				const moveDrag = (x: number) => {
					if (!dragging) return;
					orbitDeg -= (x - lastX) * 0.3; // drag right → the scene turns right
					lastX = x;
					applyFraming();
				};
				const endDrag = () => {
					dragging = false;
					canvas.style.cursor = 'grab';
				};
				const onMouseMove = (e: MouseEvent) => moveDrag(e.clientX);
				canvas.addEventListener('mousedown', (e) => startDrag(e.clientX));
				window.addEventListener('mousemove', onMouseMove);
				window.addEventListener('mouseup', endDrag);
				canvas.addEventListener('touchstart', (e) => e.touches[0] && startDrag(e.touches[0].clientX), {
					passive: true
				});
				canvas.addEventListener('touchmove', (e) => e.touches[0] && moveDrag(e.touches[0].clientX), {
					passive: true
				});
				canvas.addEventListener('touchend', endDrag);
				detachDrag = () => {
					window.removeEventListener('mousemove', onMouseMove);
					window.removeEventListener('mouseup', endDrag);
				};

				// reset button — back to the Sun-facing framing (orbit 0)
				const resetControl: import('maplibre-gl').IControl = {
					onAdd() {
						const c = document.createElement('div');
						c.className = 'maplibregl-ctrl maplibregl-ctrl-group';
						const b = document.createElement('button');
						b.type = 'button';
						b.title = get(t)('b3.recenter');
						b.setAttribute('aria-label', b.title);
						b.innerHTML =
							'<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/></svg>';
						b.onclick = () => {
							orbitDeg = 0;
							applyFraming();
						};
						c.appendChild(b);
						return c;
					},
					onRemove() {}
				};
				m.addControl(resetControl, 'top-right');

				const EYE = 1.7; // eye height used to place the Sun disc / horizon test above the ground

				// max elevation angle of the terrain along an azimuth (incl. Earth-curvature dip)
				function terrainHorizonAlt(az: number, eyeAlt: number): number {
					let maxAng = -90;
					for (const d of [150, 300, 600, 1200, 2500, 5000, 10000, 20000, 40000]) {
						const [lng2, lat2] = destPoint(LAT, LON, az, d);
						const e = m.queryTerrainElevation([lng2, lat2]);
						if (e == null) continue;
						const drop = (d * d) / (2 * EARTH_RADIUS_M); // horizon dip from curvature
						const ang = Math.atan2(e - drop - eyeAlt, d) * R2D;
						if (ang > maxAng) maxAng = ang;
					}
					return maxAng;
				}

				function update() {
					const date = new Date(times[frameIndex]);
					const sm = sunMoonHorizon(LAT, LON, date);
					const s = sm.sun,
						mo = sm.moon;
					const sunAngR = Math.atan(RSUN / (s.distAu * AU)) * R2D;
					const moonAngR = Math.atan(RMOON / (mo.distAu * AU)) * R2D;
					const dx = norm180(mo.az - s.az) * Math.cos(s.alt * D2R); // +x east, +y up (screen)
					const dy = mo.alt - s.alt;
					sun.moon = [dx / sunAngR, dy / sunAngR];
					sun.moonR = moonAngR / sunAngR;

					const ground = m.queryTerrainElevation([LON, LAT] as [number, number]) ?? 0;
					const eyeAlt = ground + EYE;

					// place the Sun disc along (az, alt), far away so buildings occlude it
					const hd = SUN_DIST * Math.cos(s.alt * D2R),
						vd = SUN_DIST * Math.sin(s.alt * D2R);
					const [slng, slat] = destPoint(LAT, LON, s.az, hd);
					const merc = maplibregl.MercatorCoordinate.fromLngLat([slng, slat], eyeAlt + vd);
					sun.center = [merc.x, merc.y, merc.z, 1];

					// terrain occlusion: fade the Sun out as it drops below the terrain/curvature horizon
					const horizon = terrainHorizonAlt(s.az, eyeAlt);
					sun.opacity = Math.min(1, Math.max(0, (s.alt - horizon + 0.25) / 0.5));
					sun.visible = sun.opacity > 0.01;

					const obsc = discOverlapFraction(sunAngR, moonAngR, Math.hypot(dx, dy));

					// keep the map in sync with the simulated Sun: direction from (az, alt), brightness/colour
					// from the obscuration (same numbers that drive the Sun billboard).
					const env = environment(obsc);
					duskOpacity = env.veil; // dims the whole scene incl. the flat vector base map
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
					note = s.alt <= horizon ? get(t)('b3.behind_horizon') : '';
					m.triggerRepaint();
				}

				setFrame = (i: number) => {
					frameIndex = i;
					update();
				};
				// start at greatest eclipse
				const peakT = (lc?.peak?.time ?? new Date(ECLIPSE_DATE + 'T18:08:00Z')).getTime();
				frameIndex = Math.round(((peakT - tStart) / (tEnd - tStart)) * N);
				// NOTE: no re-framing on 'idle' — the camera is set once here and never moves on its own
				// again (a later jumpTo would fight the user's panning and appear to teleport the marker).
				m.once('idle', () => update());
				applyFraming();
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
		<div class="dusk" aria-hidden="true" style:background={DUSK_HEX} style:opacity={duskOpacity}></div>
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
			{#if note}<span class="warn">{note}</span>{/if}
		</div>
	</div>
</section>

<style>
	/* media height for the shared global .stage-canvas */
	.stage {
		--stage-h: min(60vh, 440px);
	}
	/* twilight veil — dims the whole scene (sky, terrain, buildings, flat base map) with the eclipse */
	.dusk {
		position: absolute;
		inset: 0;
		pointer-events: none;
		transition: opacity 150ms linear;
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
		& .warn {
			color: var(--warn);
		}
	}

	/* the user's location — a DOM marker on MapLibre's own DOM (added outside the component tree), so it
	   lives in a :global block under .b3. Same dot as the A2 globe's .user-pin, without the pulse. */
	:global {
		.b3 .b3-user-pin {
			width: 16px;
			height: 16px;
			border-radius: 50%;
			background: var(--marker);
			box-shadow:
				0 0 0 2px #fff,
				0 1px 5px rgba(0, 0, 0, 0.6);
			pointer-events: none;
		}
	}
</style>
