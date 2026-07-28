// Camera framing for the B3 orientation view: from the Sun's arc over the eclipse window (its azimuth
// span and peak altitude) and the viewport aspect ratio, choose the vertical FOV, the azimuth the shot is
// centred on, and the two angles that place the camera — so one fixed third-person shot behind the
// location shows the whole Sun arc (min→max azimuth, up to its peak altitude) with the marker on the
// ground below it. Pure math — no MapLibre/DOM. SkyView/cameraController turn `aimEl` and `camDep` into a
// camera pose (setback, height, pitch).
//
// The two angles are what let the shot follow the Sun up the sky. On the path of totality the Sun stays
// low (2.6° at Palma, 24.6° at Reykjavík) and the classic drone-behind-you shot works: the camera is high
// and looks DOWN at the marker, with the Sun near the top of the frame. Far from the path — New York sees
// a 1 % partial with the Sun at 64° — no amount of downward-looking framing can reach the Sun, so the
// camera sinks toward eye level and the aim tips ABOVE the horizon (MapLibre pitch > 90°, which it has
// supported since the camera rewrite). The Sun keeps its place near the top of the frame throughout; what
// gives way, once geometry leaves no choice, is the ground — first the marker slides to the bottom edge
// (~65°), then the lens opens further to keep at least the horizon line (to ~80°), and only for a Sun
// almost overhead is the frame all sky.
import { DEG_TO_RAD, RAD_TO_DEG } from '$lib/constants';

export type SunArc = {
	azMin: number; // smallest Sun azimuth over the window (deg, unwrapped)
	azMax: number; // largest Sun azimuth
	altMax: number; // highest Sun altitude (deg)
};

export type Framing = {
	fov: number; // vertical field of view (deg)
	meanAz: number; // azimuth the shot is centred on (deg)
	aimEl: number; // elevation of the view centre (deg; negative = the camera looks below the horizon)
	camDep: number; // how far the marker sits below the camera's horizontal (deg) → the camera's height
};

const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));

/** Horizontal FOV (deg) for a given vertical FOV and aspect ratio (width / height). */
const horizontalFov = (vFov: number, aspect: number) =>
	2 * Math.atan(Math.tan((vFov * DEG_TO_RAD) / 2) * aspect) * RAD_TO_DEG;

// Where the things that must be in shot sit, as a fraction of the frame height from the bottom.
const SUN_Y = 0.88; // the Sun at its highest — near the top, with a little headroom
const MARKER_Y = 0.1; // the location marker — in the bottom tenth
const HORIZON_Y = 0.05; // and once the marker has given way, at least the horizon line itself
// The same fractions as NDC offsets from the frame centre (0 = centre, 1 = edge).
const SUN_NDC = 2 * SUN_Y - 1;
const MARKER_NDC = 1 - 2 * MARKER_Y;
const HORIZON_NDC = 1 - 2 * HORIZON_Y;

const FOV_MIN = 50,
	FOV_MAX = 75, // as far as the lens opens to keep the MARKER in shot
	FOV_CEIL = 88; // and as far as it opens for anything (a wide azimuth span, or a near-overhead Sun)
const DEP_PREF = 30; // preferred camera depression: the drone-behind-you look, used while the Sun is low
const DEP_MIN = 1.5, // eye level-ish; below this the camera would be under the marker's own ground
	DEP_MAX = 45; // and this keeps a Sun that never rises from tipping the shot into a top-down view

/**
 * The angle (deg) between the view centre and a point `ndc` of the way to the frame's top or bottom edge.
 *
 * A perspective camera spreads angles across the frame by the tangent, not linearly — at these FOVs the
 * difference is several degrees, which is the whole margin the Sun has above the frame's top edge.
 */
const offsetAt = (ndc: number, fov: number) => Math.atan(ndc * Math.tan((fov * DEG_TO_RAD) / 2)) * RAD_TO_DEG;

/**
 * The narrowest FOV that holds `span` degrees of elevation between the marks `lowNdc` and `highNdc`,
 * found by bisection — the sum of two arctangents has no clean inverse, and it is monotone in `fov`.
 */
function fovForSpan(lowNdc: number, highNdc: number, span: number): number {
	let lo = 1,
		hi = 179;
	for (let i = 0; i < 40; i++) {
		const mid = (lo + hi) / 2;
		if (offsetAt(lowNdc, mid) + offsetAt(highNdc, mid) < span) lo = mid;
		else hi = mid;
	}
	return hi;
}

export function computeFraming(arc: SunArc, aspect: number): Framing {
	const azSpan = Math.max(0, arc.azMax - arc.azMin);
	const meanAz = (arc.azMin + arc.azMax) / 2;

	// Vertical FOV: wide enough that, with the camera at its preferred height, the Sun's peak and the
	// marker both land on their marks. A Sun too high for that is not chased with an ever wider lens —
	// the FOV stops at FOV_MAX and the camera drops instead (see camDep below).
	let fov = clamp(fovForSpan(MARKER_NDC, SUN_NDC, arc.altMax + DEP_PREF), FOV_MIN, FOV_MAX);
	// Past ~65° of Sun altitude even a camera on the ground cannot hold both, and the marker starts to
	// slide off the bottom edge. Widen again — as far as FOV_CEIL — to keep at least the horizon line
	// under the Sun, so the shot still reads as a view from a place rather than a rectangle of sky.
	fov = Math.max(fov, Math.min(FOV_CEIL, fovForSpan(HORIZON_NDC, SUN_NDC, arc.altMax)));
	// Widen if the horizontal FOV wouldn't cover the azimuth span (+ margin).
	while (horizontalFov(fov, aspect) < azSpan + 8 && fov < FOV_CEIL) fov += 2;

	// Aim so the Sun's peak sits at SUN_Y, then place the camera so the marker sits at MARKER_Y. Where
	// that would put the camera below the marker's own ground, the marker gives way, not the Sun.
	const aimEl = arc.altMax - offsetAt(SUN_NDC, fov);
	const camDep = clamp(offsetAt(MARKER_NDC, fov) - aimEl, DEP_MIN, DEP_MAX);

	return { fov, meanAz, aimEl, camDep };
}
