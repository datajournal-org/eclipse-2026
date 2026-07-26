// Camera framing for the B3 orientation view: from the Sun's arc over the eclipse window (its azimuth
// span and peak altitude) and the viewport aspect ratio, choose the vertical FOV and the azimuth the shot
// is centred on, so one fixed third-person shot behind the location shows the whole Sun arc (min→max
// azimuth, horizon→peak altitude) with the marker on the ground below it. Pure math — no MapLibre/DOM.
// SkyView derives the camera pose itself (setback, height, pitch) from these two numbers.
import { DEG_TO_RAD, RAD_TO_DEG } from '$lib/constants';

export type SunArc = {
	azMin: number; // smallest Sun azimuth over the window (deg, unwrapped)
	azMax: number; // largest Sun azimuth
	altMax: number; // highest Sun altitude (deg)
};

export type Framing = {
	fov: number; // vertical field of view (deg)
	meanAz: number; // azimuth the shot is centred on (deg)
};

const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));

/** Horizontal FOV (deg) for a given vertical FOV and aspect ratio (width / height). */
const horizontalFov = (vFov: number, aspect: number) =>
	2 * Math.atan(Math.tan((vFov * DEG_TO_RAD) / 2) * aspect) * RAD_TO_DEG;

export function computeFraming(arc: SunArc, aspect: number): Framing {
	const azSpan = Math.max(0, arc.azMax - arc.azMin);
	const meanAz = (arc.azMin + arc.azMax) / 2;

	const BETA = 10; // the camera looks ~this many degrees below horizontal (keeps pitch < 90)
	const altTop = clamp(arc.altMax + 3, 8, 32); // headroom above the highest Sun

	// Vertical FOV: fit horizon..altTop into the upper part while the marker sits in the lower third.
	// (BETA + altTop) is the angular span from the aim point up to the top Sun; /0.46 leaves a small margin.
	let fov = clamp((BETA + altTop) / 0.46, 50, 70);
	// Widen if the horizontal FOV wouldn't cover the azimuth span (+ margin).
	while (horizontalFov(fov, aspect) < azSpan + 8 && fov < 88) fov += 2;

	return { fov, meanAz };
}
