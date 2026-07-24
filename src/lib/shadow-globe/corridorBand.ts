// The totality corridor (path of totality): the band the umbra sweeps across Earth. For each frame
// where the umbra reaches Earth we build the umbra footprint — the SAME cylinder∩sphere ellipse the
// live iso-ring draws — and take its two extreme points perpendicular to the ground-track motion.
// Those are the corridor's edges there, so the live umbra ring touches the band exactly (it can't:
// the footprint is a tilted, elongated ellipse, so its ⊥-motion silhouette is NOT simply the point
// one umbra-radius sideways of the centre — the ellipse's long axis reaches well past that). The band
// is closed to a point at first and last contact. Rendered as a filled TRIANGLE_STRIP (pole-correct)
// by isoLinesLayer. Pure math, computed once at module load / prerender time.

import { sunMoonECEF } from '$lib/eclipse';
import { computeShadowModel, radiusForCoverage, type ShadowModel } from './shadowProfile';
import { TIMELINE_START, TIMELINE_END } from '$lib/config';
import type { Vec3 } from '$lib/types';

const TOTALITY_LEVEL = 0.999; // obscuration threshold that defines the umbra edge — must match ISO_RINGS' 100 % level
const RING_STEPS = 512; // angular samples of the umbra footprint when finding its ⊥-motion extremes
// The band edges connect per-station extremes with straight segments; on a curving ground track those
// chords cut the corner of the true envelope, letting the umbra bulge out. We therefore sample the
// corridor much finer than the animation frames (this runs once at build/prerender time, so it's free).
const CORRIDOR_STEP_MS = 5 * 1000;
const RAD_TO_DEG = 180 / Math.PI;

type Station = { time: number; center: Vec3; model: ShadowModel; umbraRadius: number };

export type CorridorEdges = { north: [number, number][]; south: [number, number][] };

function computeCorridor(): CorridorEdges {
	// One station per frame where the umbra's axis reaches Earth (footLen < 1).
	const stations: Station[] = [];
	let outsideBefore: number | null = null; // last frame before first contact
	for (let t = TIMELINE_START.getTime(); t <= TIMELINE_END.getTime(); t += CORRIDOR_STEP_MS) {
		const model = computeShadowModel(sunMoonECEF(new Date(t)));
		const footLen = length(model.center);
		if (footLen >= 1) {
			if (stations.length === 0) outsideBefore = t;
			continue;
		}
		const umbraRadius = radiusForCoverage(model, TOTALITY_LEVEL);
		if (umbraRadius == null) continue; // not total
		stations.push({ time: t, center: umbraCentreOnSphere(model, footLen), model, umbraRadius });
	}

	const north: [number, number][] = [];
	const south: [number, number][] = [];
	if (stations.length === 0) return { north, south };

	// Taper to the exact first-contact point (footLen = 1), if we have a frame just outside it.
	if (outsideBefore != null) {
		const start = contactPoint(outsideBefore, stations[0].time);
		north.push(start);
		south.push(start);
	}

	// Motion direction from a stable ~30 s baseline, not adjacent 5 s stations (whose tiny centre
	// difference makes the tangent — and thus `lateral`, and thus the support point on the very
	// elongated ellipse — noisy).
	const span = Math.max(1, Math.round(30000 / CORRIDOR_STEP_MS));
	for (let i = 0; i < stations.length; i++) {
		const { center: C, model, umbraRadius } = stations[i];
		const tangent = normalize(
			sub(stations[Math.min(stations.length - 1, i + span)].center, stations[Math.max(0, i - span)].center)
		);
		const lateral = normalize(cross(C, tangent)); // ⊥ to motion, in the tangent plane
		const [nP, sP] = ringExtremes(model, umbraRadius, lateral, C);
		north.push(toLonLat(nP));
		south.push(toLonLat(sP));
	}

	// Taper to the exact last-contact point.
	const lastTime = stations[stations.length - 1].time;
	const outsideAfter = lastTime + CORRIDOR_STEP_MS;
	if (length(computeShadowModel(sunMoonECEF(new Date(outsideAfter))).center) >= 1) {
		const end = contactPoint(outsideAfter, lastTime);
		north.push(end);
		south.push(end);
	}

	return { north, south };
}

export const corridorEdges = computeCorridor();

/** Umbra centre on the unit sphere = the sunward axis–sphere intersection. */
function umbraCentreOnSphere(model: ShadowModel, footLen: number): Vec3 {
	const s = Math.sqrt(Math.max(0, 1 - footLen * footLen));
	return [
		model.center[0] + s * model.axis[0],
		model.center[1] + s * model.axis[1],
		model.center[2] + s * model.axis[2]
	];
}

/**
 * The two extreme points of the umbra footprint along ±`lateral` — i.e. the corridor edges at this
 * station. The footprint is the cylinder(radius)∩sphere ellipse restricted to the sunlit side, the
 * exact curve isoRing() draws; we sample it and keep the sunlit vertices with the max / min
 * projection onto `lateral`. `fallback` (the umbra centre) is returned for a degenerate empty ring.
 */
function ringExtremes(model: ShadowModel, radius: number, lateral: Vec3, fallback: Vec3): [Vec3, Vec3] {
	const foot = model.center,
		axis = model.axis,
		sunDir = model.sunDir;
	const footLen = length(foot);
	const u: Vec3 =
		footLen > 1e-6
			? [foot[0] / footLen, foot[1] / footLen, foot[2] / footLen]
			: normalize(cross(axis, Math.abs(axis[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0]));
	const v = cross(axis, u);

	let nBest = -Infinity,
		sBest = Infinity;
	let nP = fallback,
		sP = fallback;
	for (let i = 0; i < RING_STEPS; i++) {
		const theta = (i / RING_STEPS) * 2 * Math.PI;
		const cosT = Math.cos(theta),
			sinT = Math.sin(theta);
		const disc = 1 - footLen * footLen - radius * radius - 2 * footLen * radius * cosT;
		if (disc < 0) continue; // off the limb
		const w = Math.sqrt(disc);
		const P: Vec3 = [
			foot[0] + radius * (cosT * u[0] + sinT * v[0]) + w * axis[0],
			foot[1] + radius * (cosT * u[1] + sinT * v[1]) + w * axis[1],
			foot[2] + radius * (cosT * u[2] + sinT * v[2]) + w * axis[2]
		];
		if (P[0] * sunDir[0] + P[1] * sunDir[1] + P[2] * sunDir[2] <= 0) continue; // night side
		const d = P[0] * lateral[0] + P[1] * lateral[1] + P[2] * lateral[2];
		if (d > nBest) {
			nBest = d;
			nP = P;
		}
		if (d < sBest) {
			sBest = d;
			sP = P;
		}
	}
	return [nP, sP];
}

/** The umbra centre (= foot on the sphere) at footLen = 1, found by bisecting the time. */
function contactPoint(tOutside: number, tInside: number): [number, number] {
	let lo = tOutside, // footLen >= 1
		hi = tInside; // footLen < 1
	for (let k = 0; k < 22; k++) {
		const mid = (lo + hi) / 2;
		if (length(computeShadowModel(sunMoonECEF(new Date(mid))).center) >= 1) lo = mid;
		else hi = mid;
	}
	return toLonLat(normalize(computeShadowModel(sunMoonECEF(new Date(hi))).center));
}

function toLonLat(v: Vec3): [number, number] {
	return [Math.atan2(v[1], v[0]) * RAD_TO_DEG, Math.asin(clamp(v[2], -1, 1)) * RAD_TO_DEG];
}
function sub(a: Vec3, b: Vec3): Vec3 {
	return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}
function cross(a: Vec3, b: Vec3): Vec3 {
	return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}
function length(a: Vec3): number {
	return Math.hypot(a[0], a[1], a[2]);
}
function normalize(a: Vec3): Vec3 {
	const l = length(a) || 1;
	return [a[0] / l, a[1] / l, a[2] / l];
}
function clamp(x: number, lo: number, hi: number): number {
	return x < lo ? lo : x > hi ? hi : x;
}
