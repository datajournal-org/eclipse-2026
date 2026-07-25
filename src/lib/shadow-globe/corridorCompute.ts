// Computes the totality corridor (path of totality) as the UNION of all umbra footprints, in the same
// spherical shadow model the live iso-rings use — so the drawn umbra always sits inside the band.
//
// This is the expensive, accurate version, meant to run once at build time (see scripts/build-corridor.ts,
// which writes corridor.generated.ts). Nothing here runs in the browser.
//
// Method (a robust form of the classic central-line + path-width construction):
//   1. Sample the shadow model on a fine time grid; keep the instants that are total.
//   2. Central line = the umbra ground point (shadow axis ∩ sphere) at each such instant.
//   3. Resample the central line uniformly BY ARC LENGTH → stable tangents/perpendiculars (the time
//      parametrisation races at grazing; the geometric curve does not).
//   4. At each centre, march the geodesic perpendicular outward and find where the point LEAVES the
//      union — i.e. where it is no longer inside any instant's umbra. Because we test membership in the
//      union (min over time), not one instant's ballooning footprint, the width is stable and bounded,
//      and it contains every umbra ring by construction.
//   5. Cap each end with the exact first/last-contact point for a clean zero-width tip.

import { sunMoonECEF } from '$lib/eclipse';
import { computeShadowModel, radiusForCoverage } from './shadowProfile';
import { TIMELINE_START, TIMELINE_END } from '$lib/config';
import type { Vec3 } from '$lib/types';
import { clamp, cross, dot, length, lerp, negate, normalize, offset, sub, toLonLat } from './vec3';

export type CorridorEdges = { north: [number, number][]; south: [number, number][] };

const TOTALITY_LEVEL = 0.999; // obscuration threshold defining the umbra edge — matches ISO_RINGS' 100 %
const SAMPLE_STEP_MS = 2000; // fine time sampling of the shadow model
const RESAMPLE_SPACING = 0.004; // arc-length spacing of the central line (rad ≈ 25 km)
const UNION_WINDOW_MS = 300_000; // ± window over which a point may be swept by the umbra (union test)
const MAX_HALF_WIDTH = 0.06; // rad — upper bound for the cross-track search (~380 km)
const BISECT_ITERS = 28;

type Frame = { t: number; foot: Vec3; axis: Vec3; sunDir: Vec3; radius: number };
type CenterPt = { t: number; C: Vec3 };

export function computeCorridor(): CorridorEdges {
	// 1) Fine time grid of shadow models; keep only instants where a total eclipse exists.
	const frames: Frame[] = [];
	for (let t = TIMELINE_START.getTime(); t <= TIMELINE_END.getTime(); t += SAMPLE_STEP_MS) {
		const model = computeShadowModel(sunMoonECEF(new Date(t)));
		const radius = radiusForCoverage(model, TOTALITY_LEVEL);
		if (radius == null) continue; // no on-axis totality this instant
		frames.push({ t, foot: model.center, axis: model.axis, sunDir: model.sunDir, radius });
	}

	// 2) Central line: umbra ground point (near-side axis ∩ unit sphere) where the axis reaches Earth.
	const centers: CenterPt[] = [];
	let firstContactFrame = -1; // last total frame before the umbra reaches Earth (footLen ≥ 1)
	let lastContactFrame = -1; // first total frame after it leaves
	for (let i = 0; i < frames.length; i++) {
		const f = frames[i];
		const footLen = length(f.foot);
		if (footLen >= 1) {
			if (centers.length === 0) firstContactFrame = i;
			else if (lastContactFrame < 0) lastContactFrame = i;
			continue;
		}
		if (lastContactFrame >= 0) continue; // ignore a second window (impossible for this eclipse)
		const s = Math.sqrt(1 - footLen * footLen);
		centers.push({ t: f.t, C: [f.foot[0] + s * f.axis[0], f.foot[1] + s * f.axis[1], f.foot[2] + s * f.axis[2]] });
	}
	if (centers.length < 2) return { north: [], south: [] };

	// 3) Uniform arc-length resample → smooth, stable perpendiculars.
	const line = resampleByArc(centers, RESAMPLE_SPACING);
	const n = line.length;

	// Perpendicular (⊥ motion) per centre, sign-propagated from the middle so north/south never swap.
	const lateral: Vec3[] = line.map((p, i) => {
		const tangent = normalize(sub(line[Math.min(n - 1, i + 1)].C, line[Math.max(0, i - 1)].C));
		return normalize(cross(p.C, tangent));
	});
	const mid = n >> 1;
	for (let i = mid + 1; i < n; i++) if (dot(lateral[i], lateral[i - 1]) < 0) lateral[i] = negate(lateral[i]);
	for (let i = mid - 1; i >= 0; i--) if (dot(lateral[i], lateral[i + 1]) < 0) lateral[i] = negate(lateral[i]);

	// 4) Cross-track half-width on each side via the union boundary.
	const north: [number, number][] = [];
	const south: [number, number][] = [];
	for (let i = 0; i < n; i++) {
		const { C, t } = line[i];
		north.push(toLonLat(offset(C, lateral[i], halfWidth(C, lateral[i], t, frames))));
		south.push(toLonLat(offset(C, negate(lateral[i]), halfWidth(C, negate(lateral[i]), t, frames))));
	}

	// 5) Exact contact-point tips (footLen = 1) for clean ends.
	if (firstContactFrame >= 0) {
		const tip = contactPoint(frames[firstContactFrame].t, line[0].t);
		north.unshift(tip);
		south.unshift(tip);
	}
	if (lastContactFrame >= 0) {
		const tip = contactPoint(frames[lastContactFrame].t, line[n - 1].t);
		north.push(tip);
		south.push(tip);
	}

	return { north, south };
}

/** Geodesic distance (rad) from centre `C` along `dir` at which the point leaves the umbra union. */
function halfWidth(C: Vec3, dir: Vec3, tCenter: number, frames: Frame[]): number {
	if (inUnion(offset(C, dir, MAX_HALF_WIDTH), tCenter, frames)) return MAX_HALF_WIDTH;
	let lo = 0,
		hi = MAX_HALF_WIDTH; // lo inside (C is on the axis), hi outside
	for (let k = 0; k < BISECT_ITERS; k++) {
		const midRho = (lo + hi) / 2;
		if (inUnion(offset(C, dir, midRho), tCenter, frames)) lo = midRho;
		else hi = midRho;
	}
	return lo;
}

/** Is point `P` swept by the umbra at any instant near `tCenter`? (Membership in the union.) */
function inUnion(P: Vec3, tCenter: number, frames: Frame[]): boolean {
	for (const f of frames) {
		if (Math.abs(f.t - tCenter) > UNION_WINDOW_MS) continue;
		if (P[0] * f.sunDir[0] + P[1] * f.sunDir[1] + P[2] * f.sunDir[2] <= 0) continue; // night side
		if (perpDist(P, f.foot, f.axis) <= f.radius) return true;
	}
	return false;
}

/** Perpendicular distance from unit `P` to the shadow axis (line through `foot`, direction `axis`). */
function perpDist(P: Vec3, foot: Vec3, axis: Vec3): number {
	const dx = P[0] - foot[0],
		dy = P[1] - foot[1],
		dz = P[2] - foot[2];
	const along = dx * axis[0] + dy * axis[1] + dz * axis[2];
	return Math.hypot(dx - along * axis[0], dy - along * axis[1], dz - along * axis[2]);
}

/** The umbra ground point at footLen = 1, found by bisecting the time between an outside and inside frame. */
function contactPoint(tOutside: number, tInside: number): [number, number] {
	let lo = tOutside, // footLen ≥ 1
		hi = tInside; // footLen < 1
	for (let k = 0; k < 24; k++) {
		const midT = (lo + hi) / 2;
		if (length(computeShadowModel(sunMoonECEF(new Date(midT))).center) >= 1) lo = midT;
		else hi = midT;
	}
	return toLonLat(normalize(computeShadowModel(sunMoonECEF(new Date(hi))).center));
}

/** Uniformly resample a unit-vector polyline by geodesic arc length `spacing` (rad). */
function resampleByArc(pts: CenterPt[], spacing: number): CenterPt[] {
	const out: CenterPt[] = [{ t: pts[0].t, C: pts[0].C }];
	let startC = pts[0].C,
		startT = pts[0].t;
	let remaining = spacing;
	for (let j = 1; j < pts.length; j++) {
		let seg = Math.acos(clamp(dot(startC, pts[j].C), -1, 1));
		while (seg >= remaining) {
			const f = remaining / seg;
			const C = normalize(lerp(startC, pts[j].C, f));
			const t = startT + (pts[j].t - startT) * f;
			out.push({ t, C });
			startC = C;
			startT = t;
			seg = Math.acos(clamp(dot(startC, pts[j].C), -1, 1));
			remaining = spacing;
		}
		remaining -= seg;
		startC = pts[j].C;
		startT = pts[j].t;
	}
	return out;
}
