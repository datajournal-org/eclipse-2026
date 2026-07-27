// The B3 third-person camera rig and its interaction. The camera sits `camDist` metres behind the location
// marker at a fixed, sea-level-referenced altitude (so it never bobs as it orbits over mountainous ground)
// and orbits the marker via `orbitDeg`. Zoom is a dolly (camDist) tuned to feel like the A2 globe's native
// zoom: a smoothed wheel, +/- buttons, double-click and two-finger pinch — only the input matches A2, the
// sky/Sun don't scale. Returns applyFraming (re-derive the pose), addControls (+/- and reset buttons) and
// detach (drop the window/rAF listeners on teardown).
import type { IControl, Map as MlMap } from 'maplibre-gl';
import { destPoint } from '$lib/shadow-globe/vec3';
import { DEG_TO_RAD as D2R } from '$lib/constants';

// Only the LngLat constructor is needed from the (dynamically imported) maplibre runtime.
type Mlgl = { LngLat: typeof import('maplibre-gl').LngLat };

export function createCameraController(opts: {
	maplibregl: Mlgl;
	m: MlMap;
	lat: number;
	lon: number;
	framing: { fov: number; meanAz: number };
	altMax: number;
	label: (key: string) => string;
}) {
	const { maplibregl, m, lat: LAT, lon: LON, framing, altMax, label } = opts;

	const DIST_MIN = 50,
		DIST_MAX = 1000,
		DIST_DEFAULT = 200; // camera distance behind the marker (m): min / default / max for the zoom
	let camDist = DIST_DEFAULT; // vertical-drag offset → dolly the camera toward/away from the marker
	let orbitDeg = 0; // horizontal-drag offset → the camera orbits around the marker

	// Positioned camera: `camDist` metres behind the marker, at a sea-level-referenced altitude so the
	// marker sits ~10% from the bottom. The whole rig scales with camDist (camera pos + view centre), so the
	// marker keeps its screen spot while near terrain grows/shrinks → a dolly zoom. camAlt is constant across
	// the orbit (only the bearing changes) and centerClampedToGround is off, so the camera height never bobs.
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

	const canvas = m.getCanvas();
	canvas.style.cursor = 'grab';

	/**
	 * Move the camera at most once per animation frame.
	 *
	 * A pointer reports far faster than the display paints — a high-poll mouse or trackpad easily lands
	 * three `mousemove`s in one frame — and every `applyFraming()` is a `jumpTo`, which makes MapLibre
	 * re-derive its tile coverage. Repainting the scene unchanged is nearly free (measured: p90 9.1 ms
	 * against a 9.3 ms idle baseline), but three camera moves in a frame cost p90 21.5 ms, over twice the
	 * frame budget — so all but the last were paid for and then thrown away.
	 *
	 * `orbitDeg` still accumulates on every event, so no pointer movement is lost; only the expensive
	 * consequence is deferred to the moment it can be shown.
	 */
	let framingRaf = 0;
	const scheduleFraming = () => {
		if (framingRaf) return;
		framingRaf = requestAnimationFrame(() => {
			framingRaf = 0;
			applyFraming();
		});
	};

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
		scheduleFraming();
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
				scheduleFraming(); // touchmove outruns the display exactly as mousemove does
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

	// zoom +/- control — same look as the A2 globe's NavigationControl (MapLibre's own zoom-in/out classes
	// → same icons, styled by map.css), but driving the dolly (camDist), not the map zoom.
	const zoomControl: IControl = {
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
			c.appendChild(mkBtn('maplibregl-ctrl-zoom-in', label('b3.zoom_in'), ZOOM_STEP));
			c.appendChild(mkBtn('maplibregl-ctrl-zoom-out', label('b3.zoom_out'), 1 / ZOOM_STEP));
			return c;
		},
		onRemove() {}
	};

	// reset button — back to the Sun-facing framing (orbit 0)
	const resetControl: IControl = {
		onAdd() {
			const c = document.createElement('div');
			c.className = 'maplibregl-ctrl maplibregl-ctrl-group';
			const b = document.createElement('button');
			b.type = 'button';
			b.title = label('b3.recenter');
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

	return {
		applyFraming,
		addControls() {
			m.addControl(zoomControl, 'top-right');
			m.addControl(resetControl, 'top-right');
		},
		detach() {
			window.removeEventListener('mousemove', onMouseMove);
			window.removeEventListener('mouseup', endDrag);
			if (zoomRaf) cancelAnimationFrame(zoomRaf);
			if (framingRaf) cancelAnimationFrame(framingRaf);
		}
	};
}
