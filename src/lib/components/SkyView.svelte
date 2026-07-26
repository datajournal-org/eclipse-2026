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
		MOON_RADIUS_KM as RMOON
	} from '$lib/constants';

	const ELEV = 'https://tiles.versatiles.org/tiles/elevation/{z}/{x}/{y}';

	// loupe sky-colour helpers: blend the sky palette by altitude, then dim toward dusk like the veil does
	type Rgb = [number, number, number];
	const SKY_HI = hexToRgb(SKY_PALETTE.sky);
	const SKY_LO = hexToRgb(SKY_PALETTE.horizon);
	const DUSK_RGB = hexToRgb(DUSK_HEX);
	const NIGHT_RGB = hexToRgb('#05070d'); // near-black the veil trends toward at totality
	const mix3 = (a: Rgb, b: Rgb, t: number): Rgb => [
		a[0] + (b[0] - a[0]) * t,
		a[1] + (b[1] - a[1]) * t,
		a[2] + (b[2] - a[2]) * t
	];
	const cssRgb = (c: Rgb) => `rgb(${Math.round(c[0] * 255)} ${Math.round(c[1] * 255)} ${Math.round(c[2] * 255)})`;

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

				// Positioned camera: `camDist` metres behind the marker, at a sea-level-referenced altitude so the
				// marker sits ~10% from the bottom. The whole rig scales with camDist (camera pos + view centre),
				// so the marker keeps its screen spot while near terrain grows/shrinks → a dolly zoom. camAlt is
				// constant across the orbit (only the bearing changes) and centerClampedToGround is off, so the
				// camera height never bobs with the terrain as it orbits.
				const DIST_MIN = 50,
					DIST_MAX = 1000,
					DIST_DEFAULT = 200; // camera distance behind the marker (m): min / default / max for the zoom
				let camDist = DIST_DEFAULT; // vertical-drag offset → dolly the camera toward/away from the marker
				let orbitDeg = 0; // horizontal-drag offset → the camera orbits around the marker
				function applyFraming() {
					const gAlt = m.queryTerrainElevation([LON, LAT] as [number, number]) ?? 0;
					// view-centre depression (deg below horizontal): keep the frame's top just above the Sun's peak
					const c = Math.max(6, Math.min(18, framing.fov / 2 - (altMax + 6)));
					const delta = c + 0.4 * framing.fov; // depression to the marker → 90% down (10% from bottom)
					const camAlt = gAlt + camDist * Math.tan(delta * D2R);
					const az = framing.meanAz + orbitDeg; // orbit the whole rig around the marker
					const [cLon, cLat] = destPoint(LAT, LON, az + 180, camDist); // camera behind the marker (circle)
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

				// Interaction. Horizontal drag orbits the camera around the marker; zoom is a dolly (camDist) tuned
				// to feel like the A2 globe's native zoom: a smoothed wheel, +/- buttons, double-click and
				// two-finger pinch. It stays a dolly (the sky/Sun don't scale) — only the input matches A2.
				const canvas = m.getCanvas();
				canvas.style.cursor = 'grab';

				// orbit (horizontal drag / one finger)
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

				// zoom (dolly): wheel + double-click + the +/- buttons ease toward a target; pinch is direct
				const clampDist = (d: number) => Math.max(DIST_MIN, Math.min(DIST_MAX, d));
				let camDistTarget = camDist;
				let zoomRaf = 0;
				const easeZoom = () => {
					camDist += (camDistTarget - camDist) * 0.25; // smooth glide, like MapLibre's scroll zoom
					if (Math.abs(camDistTarget - camDist) < 0.5) {
						camDist = camDistTarget;
						zoomRaf = 0;
					} else {
						zoomRaf = requestAnimationFrame(easeZoom);
					}
					applyFraming();
				};
				const zoomBy = (factor: number) => {
					camDistTarget = clampDist(camDistTarget * factor);
					if (!zoomRaf) zoomRaf = requestAnimationFrame(easeZoom);
				};
				const onWheel = (e: WheelEvent) => {
					e.preventDefault(); // zoom the scene instead of scrolling the page (as the A2 map does)
					const px = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaMode === 2 ? e.deltaY * 400 : e.deltaY;
					zoomBy(Math.exp(px * 0.0025)); // scroll up → closer, down → farther
				};
				const ZOOM_STEP = 0.6; // camDist factor per +/- click or double-click (<1 = closer)
				const onDblClick = (e: MouseEvent) => {
					e.preventDefault();
					zoomBy(e.shiftKey ? 1 / ZOOM_STEP : ZOOM_STEP); // shift = out, like MapLibre
				};

				// touch: one finger orbits, two fingers pinch-zoom (direct, like the globe)
				let pinchGap0 = 0,
					pinchCam0 = 0;
				const touchGap = (t: TouchList) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
				const onTouchStart = (e: TouchEvent) => {
					if (e.touches.length >= 2) {
						dragging = false;
						if (zoomRaf) {
							cancelAnimationFrame(zoomRaf);
							zoomRaf = 0;
						}
						pinchGap0 = touchGap(e.touches);
						pinchCam0 = camDist;
						camDistTarget = camDist;
					} else if (e.touches[0]) startDrag(e.touches[0].clientX);
				};
				const onTouchMove = (e: TouchEvent) => {
					if (e.touches.length >= 2) {
						e.preventDefault(); // capture the pinch instead of scrolling the page
						const gap = touchGap(e.touches);
						if (pinchGap0 > 0) {
							camDist = camDistTarget = clampDist(pinchCam0 * (pinchGap0 / gap)); // fingers apart → closer
							applyFraming();
						}
					} else if (dragging && e.touches[0]) moveDrag(e.touches[0].clientX);
				};
				const onTouchEnd = (e: TouchEvent) => {
					if (e.touches.length < 2) pinchGap0 = 0;
					if (e.touches.length === 0) endDrag();
				};

				canvas.addEventListener('mousedown', (e) => startDrag(e.clientX));
				window.addEventListener('mousemove', onMouseMove);
				window.addEventListener('mouseup', endDrag);
				canvas.addEventListener('wheel', onWheel, { passive: false });
				canvas.addEventListener('dblclick', onDblClick);
				canvas.addEventListener('touchstart', onTouchStart, { passive: true });
				canvas.addEventListener('touchmove', onTouchMove, { passive: false });
				canvas.addEventListener('touchend', onTouchEnd);
				canvas.addEventListener('touchcancel', onTouchEnd);
				detachDrag = () => {
					window.removeEventListener('mousemove', onMouseMove);
					window.removeEventListener('mouseup', endDrag);
					if (zoomRaf) cancelAnimationFrame(zoomRaf);
				};

				// zoom +/- control — same look as the A2 globe's NavigationControl (MapLibre's own zoom-in/out
				// classes → same icons, styled by map.css), but driving the dolly (camDist), not the map zoom.
				const zoomControl: import('maplibre-gl').IControl = {
					onAdd() {
						const c = document.createElement('div');
						c.className = 'maplibregl-ctrl maplibregl-ctrl-group';
						const mkBtn = (cls: string, title: string, factor: number) => {
							const b = document.createElement('button');
							b.type = 'button';
							b.className = cls;
							b.title = title;
							b.setAttribute('aria-label', title);
							const icon = document.createElement('span');
							icon.className = 'maplibregl-ctrl-icon';
							icon.setAttribute('aria-hidden', 'true');
							b.appendChild(icon);
							b.onclick = () => zoomBy(factor);
							return b;
						};
						c.appendChild(mkBtn('maplibregl-ctrl-zoom-in', get(t)('b3.zoom_in'), ZOOM_STEP));
						c.appendChild(mkBtn('maplibregl-ctrl-zoom-out', get(t)('b3.zoom_out'), 1 / ZOOM_STEP));
						return c;
					},
					onRemove() {}
				};
				m.addControl(zoomControl, 'top-right');

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
							'<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg>';
						b.onclick = () => {
							orbitDeg = 0;
							camDist = camDistTarget = DIST_DEFAULT;
							applyFraming();
						};
						c.appendChild(b);
						return c;
					},
					onRemove() {}
				};
				m.addControl(resetControl, 'top-right');

				const EYE = 1.7; // eye height used to place the Sun disc above the ground

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

					const obsc = discOverlapFraction(sunAngR, moonAngR, Math.hypot(dx, dy));

					// keep the map in sync with the simulated Sun: direction from (az, alt), brightness/colour
					// from the obscuration (same numbers that drive the Sun billboard).
					const env = environment(obsc);
					duskEl.style.opacity = String(env.veil); // dims the whole rendered scene, not the marker
					// near totality, darken the veil colour from dusk-blue toward near-black, so the plunge reads
					// as (almost) night rather than just "more blue"
					const nightMix = Math.max(0, Math.min(1, (obsc - 0.9) / 0.1));
					const veilRgb = mix3(DUSK_RGB, NIGHT_RGB, nightMix);
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
					// loupe background = the sky behind the low Sun: blend horizon→sky by altitude, then dim toward
					// dusk exactly as the veil dims the scene, so the loupe reads as a zoomed cutout of that sky.
					const skyT = Math.max(0, Math.min(1, s.alt / 30));
					loupeSky = cssRgb(mix3(mix3(SKY_LO, SKY_HI, skyT), veilRgb, env.veil));
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
				// start at greatest eclipse
				const peakT = (lc?.peak?.time ?? new Date(ECLIPSE_DATE + 'T18:08:00Z')).getTime();
				frameIndex = Math.round(((peakT - tStart) / (tEnd - tStart)) * N);
				// A + B overlay: keep the Sun locator marker + the loupe's two connector lines glued to the tiny
				// real Sun each rendered frame (the camera can move without a scrub). The loupe crescent updates
				// in update(). Loupe and marker are squares; the two connectors are the convex-hull "bridge"
				// edges between them (the polygon analogue of the external tangents between two circles).
				const LOUPE_C: [number, number] = [58, 58]; // loupe centre in stage px (top/left 10 + 48)
				const LOUPE_HALF = 48; // loupe half-size (96 px / 2)
				const MARKER_HALF = 13; // locator square half-size (26 px / 2)
				type Pt = { x: number; y: number; g: number }; // g: 0 = loupe corner, 1 = marker corner
				const hull = (pts: Pt[]): Pt[] => {
					const sorted = pts.slice().sort((a, b) => a.x - b.x || a.y - b.y);
					const cross = (o: Pt, a: Pt, b: Pt) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
					const chain = (src: Pt[]) => {
						const out: Pt[] = [];
						for (const p of src) {
							while (out.length >= 2 && cross(out[out.length - 2], out[out.length - 1], p) <= 0) out.pop();
							out.push(p);
						}
						out.pop();
						return out;
					};
					return chain(sorted).concat(chain(sorted.slice().reverse()));
				};
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

					// hide the connectors when the two squares overlap (no clean funnel)
					const overlap =
						Math.abs(s[0] - LOUPE_C[0]) < LOUPE_HALF + MARKER_HALF &&
						Math.abs(s[1] - LOUPE_C[1]) < LOUPE_HALF + MARKER_HALF;
					if (overlap || !leaderA || !leaderB) {
						tangentVisible = false;
						return;
					}
					const corners: Pt[] = [
						{ x: LOUPE_C[0] - LOUPE_HALF, y: LOUPE_C[1] - LOUPE_HALF, g: 0 },
						{ x: LOUPE_C[0] + LOUPE_HALF, y: LOUPE_C[1] - LOUPE_HALF, g: 0 },
						{ x: LOUPE_C[0] + LOUPE_HALF, y: LOUPE_C[1] + LOUPE_HALF, g: 0 },
						{ x: LOUPE_C[0] - LOUPE_HALF, y: LOUPE_C[1] + LOUPE_HALF, g: 0 },
						{ x: s[0] - MARKER_HALF, y: s[1] - MARKER_HALF, g: 1 },
						{ x: s[0] + MARKER_HALF, y: s[1] - MARKER_HALF, g: 1 },
						{ x: s[0] + MARKER_HALF, y: s[1] + MARKER_HALF, g: 1 },
						{ x: s[0] - MARKER_HALF, y: s[1] + MARKER_HALF, g: 1 }
					];
					const hp = hull(corners);
					const lines = [leaderA, leaderB];
					let li = 0;
					for (let i = 0; i < hp.length && li < 2; i++) {
						const a = hp[i],
							b = hp[(i + 1) % hp.length];
						if (a.g !== b.g) {
							lines[li].setAttribute('x1', String(a.x));
							lines[li].setAttribute('y1', String(a.y));
							lines[li].setAttribute('x2', String(b.x));
							lines[li].setAttribute('y2', String(b.y));
							li++;
						}
					}
					tangentVisible = li === 2;
				});

				// NOTE: no re-framing on 'idle' — the camera is set once here and never moves on its own
				// again (a later jumpTo would fight the user's panning and appear to teleport the marker).
				m.once('idle', () => {
					applyFraming();
					update();
				});
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
