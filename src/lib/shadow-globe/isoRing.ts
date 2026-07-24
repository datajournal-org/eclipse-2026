// Iso-coverage rings = intersection of a cylinder (radius X around the shadow axis) with the unit
// sphere, restricted to the sunlit hemisphere. Smooth, analytic, high-resolution — no marching
// squares. See shadowProfile.ts for how X is picked from a coverage level.
//
// `model.center` is the foot of the perpendicular from Earth's centre onto the shadow axis (⊥ to
// axis, |foot| = footLen). With u = foot/footLen and v = axis × u, a cylinder point
//     foot + X·(cosθ·u + sinθ·v) + w·axis   lies on the unit sphere when
//     w = √(1 − footLen² − X² − 2·footLen·X·cosθ).
// We take the +√ (sunward) root and keep only the day side. Because this uses only footLen (not a
// surface intersection), the rings render even when the umbra misses Earth (footLen > 1 → no ring).
//
// A ring is open where it runs off the Earth's limb (discriminant < 0, the cylinder is tangent to
// the sphere) or crosses into night (P·sunDir ≤ 0). To keep the open ends from flickering during
// the animation, each end is anchored on the *exact* boundary angle (found by bisection) instead of
// the last sampled point — so the endpoints move continuously frame to frame.

import type { Feature, MultiLineString } from 'geojson';
import type { Vec3 } from '$lib/types';
import type { ShadowModel } from './shadowProfile';

type Point = [number, number]; // [lon, lat]

/** Empty ring geometry, for initialising a MapLibre source before the first frame. */
export const EMPTY_LINES: Feature<MultiLineString> = {
	type: 'Feature',
	geometry: { type: 'MultiLineString', coordinates: [] },
	properties: null
};

const TAU = 2 * Math.PI;
const RAD_TO_DEG = 180 / Math.PI;

/**
 * @param model
 * @param radius  cylinder radius X (Earth radii) for the chosen coverage level
 * @param steps   angular samples around the ring
 */
export function isoRing(model: ShadowModel, radius: number, steps = 512): Feature<MultiLineString> {
	const foot = model.center,
		axis = model.axis,
		sunDir = model.sunDir;
	const footLen = length(foot); // perpendicular distance from Earth's centre to the shadow axis

	// Basis perpendicular to the axis. When the axis passes through Earth's centre (footLen ≈ 0) any
	// u ⊥ axis works.
	const u: Vec3 =
		footLen > 1e-6
			? [foot[0] / footLen, foot[1] / footLen, foot[2] / footLen]
			: normalize(cross(axis, Math.abs(axis[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0]));
	const v = cross(axis, u);

	// Surface point at angle θ, plus whether it is on the sphere and sunlit.
	const at = (theta: number): { valid: boolean; P: Vec3 } => {
		const cosT = Math.cos(theta),
			sinT = Math.sin(theta);
		const disc = 1 - footLen * footLen - radius * radius - 2 * footLen * radius * cosT;
		const w = Math.sqrt(Math.max(0, disc));
		const P: Vec3 = [
			foot[0] + radius * (cosT * u[0] + sinT * v[0]) + w * axis[0],
			foot[1] + radius * (cosT * u[1] + sinT * v[1]) + w * axis[1],
			foot[2] + radius * (cosT * u[2] + sinT * v[2]) + w * axis[2]
		];
		const valid = disc >= 0 && dot(P, sunDir) > 0;
		return { valid, P };
	};
	const toLonLat = (P: Vec3): Point => [
		Math.atan2(P[1], P[0]) * RAD_TO_DEG,
		Math.asin(clamp(P[2], -1, 1)) * RAD_TO_DEG
	];

	// Exact boundary point between an invalid and a valid angle (bisection → the valid-side limit,
	// i.e. exactly on the limb or the terminator, whichever ends the arc).
	const boundaryPoint = (thetaInvalid: number, thetaValid: number): Point => {
		let ti = thetaInvalid,
			tv = thetaValid;
		for (let iter = 0; iter < 24; iter++) {
			const mid = (ti + tv) / 2;
			if (at(mid).valid) tv = mid;
			else ti = mid;
		}
		return toLonLat(at(tv).P);
	};

	// Sample validity + points once around the ring.
	const valid: boolean[] = new Array(steps);
	const point: (Point | null)[] = new Array(steps);
	for (let i = 0; i < steps; i++) {
		const e = at((i / steps) * TAU);
		valid[i] = e.valid;
		point[i] = e.valid ? toLonLat(e.P) : null;
	}

	const segments: Point[][] = [];
	const emit = (points: Point[]) => {
		for (const seg of splitAtAntimeridian(points)) if (seg.length > 1) segments.push(seg);
	};

	if (valid.every(Boolean)) {
		emit([...(point as Point[]), point[0] as Point]); // fully closed ring
	} else if (valid.some(Boolean)) {
		// Walk from a gap so runs never wrap the θ=0 seam; anchor each end on its exact boundary.
		const thetaOf = (i: number) => (i / steps) * TAU;
		const adjacent = (invalidIdx: number, validIdx: number): [number, number] => {
			// bring the two angles within one step
			let ti = thetaOf(invalidIdx),
				tv = thetaOf(validIdx);
			if (ti - tv > Math.PI) ti -= TAU;
			else if (tv - ti > Math.PI) ti += TAU;
			return [ti, tv];
		};
		const finish = (run: { start: number; end: number; points: Point[] }) => {
			const prev = (run.start - 1 + steps) % steps,
				next = (run.end + 1) % steps;
			const startB = boundaryPoint(...adjacent(prev, run.start));
			const endB = boundaryPoint(...adjacent(next, run.end));
			emit([startB, ...run.points, endB]);
		};

		const start = valid.indexOf(false);
		let run: { start: number; end: number; points: Point[] } | null = null;
		for (let n = 0; n < steps; n++) {
			const i = (start + n) % steps;
			if (valid[i]) {
				if (!run) run = { start: i, end: i, points: [] };
				run.points.push(point[i] as Point);
				run.end = i;
			} else if (run) {
				finish(run);
				run = null;
			}
		}
		if (run) finish(run);
	}

	return { type: 'Feature', geometry: { type: 'MultiLineString', coordinates: segments }, properties: null };
}

/**
 * The day/night boundary (terminator) as a GeoJSON line: the great circle where the Sun sits
 * exactly on the horizon (P·sunDir = 0). The iso-ring open ends are anchored on this same circle,
 * so drawing it lets you check they coincide with the shader's day/night transition.
 */
export function terminatorLine(sunDir: Vec3, steps = 256): Feature<MultiLineString> {
	const ref: Vec3 = Math.abs(sunDir[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0];
	const u = normalize(cross(sunDir, ref)); // two orthonormal directions spanning the plane ⊥ sunDir
	const w = cross(sunDir, u);
	const points: Point[] = [];
	for (let i = 0; i <= steps; i++) {
		const theta = (i / steps) * TAU;
		const cosT = Math.cos(theta),
			sinT = Math.sin(theta);
		const P: Vec3 = [u[0] * cosT + w[0] * sinT, u[1] * cosT + w[1] * sinT, u[2] * cosT + w[2] * sinT];
		points.push([Math.atan2(P[1], P[0]) * RAD_TO_DEG, Math.asin(clamp(P[2], -1, 1)) * RAD_TO_DEG]);
	}
	return {
		type: 'Feature',
		geometry: { type: 'MultiLineString', coordinates: splitAtAntimeridian(points) },
		properties: null
	};
}

/** Split a point run wherever consecutive longitudes jump the antimeridian. */
function splitAtAntimeridian(points: Point[]): Point[][] {
	const runs: Point[][] = [];
	let current: Point[] = [points[0]];
	for (let i = 1; i < points.length; i++) {
		if (Math.abs(points[i][0] - points[i - 1][0]) > 180) {
			runs.push(current);
			current = [points[i]];
		} else current.push(points[i]);
	}
	runs.push(current);
	return runs;
}

// --- tiny vec3 helpers ---
function dot(a: Vec3, b: Vec3): number {
	return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}
function length(a: Vec3): number {
	return Math.hypot(a[0], a[1], a[2]);
}
function normalize(a: Vec3): Vec3 {
	const l = length(a) || 1;
	return [a[0] / l, a[1] / l, a[2] / l];
}
function cross(a: Vec3, b: Vec3): Vec3 {
	return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}
function clamp(x: number, lo: number, hi: number): number {
	return x < lo ? lo : x > hi ? hi : x;
}
