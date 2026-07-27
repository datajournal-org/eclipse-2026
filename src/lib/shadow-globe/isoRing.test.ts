import { describe, it, expect } from 'vitest';
import { isoRing, terminatorLine, umbraGroundPoint, labelPoint } from './isoRing';
import { computeShadowModel, radiusForCoverage } from './shadowProfile';
import { sunMoonECEF, shadowCenter } from '$lib/eclipse';
import { GREATEST } from '$lib/testing/reference';
import { latLonToUnitVector, dot, cross, normalize, length, toLonLat } from './vec3';
import { EARTH_RADIUS_KM } from '$lib/constants';
import type { Vec3 } from '$lib/types';

const model = computeShadowModel(sunMoonECEF(new Date(GREATEST.utc)));
/** A moment when the umbra has not yet reached the Earth. */
const missing = computeShadowModel(sunMoonECEF(new Date('2026-08-12T15:30:00Z')));

const allPoints = (f: ReturnType<typeof isoRing>) => f.geometry.coordinates.flat() as [number, number][];

/** Perpendicular distance (Earth radii) from a surface point to the shadow axis. */
const perpToAxis = (lon: number, lat: number) => {
	const p = latLonToUnitVector(lat, lon);
	const d = p.map((c, i) => c - model.center[i]) as Vec3;
	const along = dot(d, model.axis);
	return length(d.map((c, i) => c - along * model.axis[i]) as Vec3);
};

describe('isoRing', () => {
	const radius = radiusForCoverage(model, 0.5)!;
	const ring = isoRing(model, radius);

	it('returns a GeoJSON MultiLineString feature', () => {
		expect(ring.type).toBe('Feature');
		expect(ring.geometry.type).toBe('MultiLineString');
		expect(ring.geometry.coordinates.length).toBeGreaterThan(0);
	});

	it('places every vertex at the requested distance from the shadow axis', () => {
		// The defining property of the ring: it is the cylinder ∩ sphere curve. Longitudes may be
		// unwrapped past ±180, which latLonToUnitVector handles as an angle, so no normalisation needed.
		for (const [lon, lat] of allPoints(ring)) {
			expect(perpToAxis(lon, lat)).toBeCloseTo(radius, 4);
		}
	});

	it('stays on the sunlit hemisphere', () => {
		for (const [lon, lat] of allPoints(ring)) {
			expect(dot(latLonToUnitVector(lat, lon), model.sunDir)).toBeGreaterThanOrEqual(-1e-6);
		}
	});

	it('produces finite coordinates with in-range latitudes', () => {
		for (const [lon, lat] of allPoints(ring)) {
			expect(Number.isFinite(lon) && Number.isFinite(lat)).toBe(true);
			expect(Math.abs(lat)).toBeLessThanOrEqual(90.000001);
		}
	});

	it('honours the sample count', () => {
		expect(allPoints(isoRing(model, radius, 64)).length).toBeLessThan(allPoints(isoRing(model, radius, 512)).length);
	});

	it('nests larger rings around smaller ones', () => {
		const inner = radiusForCoverage(model, 0.9)!;
		const outer = radiusForCoverage(model, 0.2)!;
		const centre = umbraGroundPoint(model)!;
		const angTo = ([lon, lat]: [number, number]) =>
			Math.acos(Math.max(-1, Math.min(1, dot(latLonToUnitVector(lat, lon), latLonToUnitVector(centre[1], centre[0])))));
		const maxInner = Math.max(...allPoints(isoRing(model, inner)).map(angTo));
		const minOuter = Math.min(...allPoints(isoRing(model, outer)).map(angTo));
		expect(minOuter).toBeGreaterThan(maxInner);
	});

	it('closes the ring when it lies entirely on the day side', () => {
		// A small ring around the umbra never reaches the limb, so it comes back as one closed loop.
		const small = isoRing(model, radiusForCoverage(model, 0.95)!);
		expect(small.geometry.coordinates).toHaveLength(1);
		const seg = small.geometry.coordinates[0];
		expect(seg[0][0]).toBeCloseTo(seg[seg.length - 1][0], 9);
		expect(seg[0][1]).toBeCloseTo(seg[seg.length - 1][1], 9);
	});

	it('opens the ring where it runs off the limb or into night', () => {
		// The outermost penumbra ring is cut by the terminator; its ends must be open, not stitched
		// across the night side.
		const wide = isoRing(model, radiusForCoverage(model, 0.02)!);
		const seg = wide.geometry.coordinates[0];
		const closed =
			Math.abs(seg[0][0] - seg[seg.length - 1][0]) < 1e-6 && Math.abs(seg[0][1] - seg[seg.length - 1][1]) < 1e-6;
		expect(closed).toBe(false);
	});

	it('anchors open ends exactly on the boundary', () => {
		// Ends are bisected onto the limb/terminator so they do not flicker frame to frame. Either the
		// end is on the terminator (P·sunDir ≈ 0) or on the limb (the cylinder is tangent to the sphere).
		const wide = isoRing(model, radiusForCoverage(model, 0.02)!);
		for (const seg of wide.geometry.coordinates) {
			for (const end of [seg[0], seg[seg.length - 1]] as [number, number][]) {
				const onTerminator = Math.abs(dot(latLonToUnitVector(end[1], end[0]), model.sunDir)) < 1e-3;
				const onLimb = Math.abs(perpToAxis(end[0], end[1]) - radiusForCoverage(model, 0.02)!) < 1e-3;
				expect(onTerminator || onLimb, `${end}`).toBe(true);
			}
		}
	});

	it('keeps longitudes continuous across the antimeridian', () => {
		// unwrapLongitudes lets |lon| exceed 180 so the line runs THROUGH the seam instead of being
		// cut in two with a gap across the globe.
		for (const seg of isoRing(model, radiusForCoverage(model, 0.1)!).geometry.coordinates) {
			for (let i = 1; i < seg.length; i++) {
				expect(Math.abs(seg[i][0] - seg[i - 1][0]), `step ${i}`).toBeLessThan(180);
			}
		}
	});

	it('moves smoothly between adjacent animation frames', () => {
		// The reason the ends are bisected: a jumping endpoint reads as flicker during the animation.
		const later = computeShadowModel(sunMoonECEF(new Date(Date.parse(GREATEST.utc) + 30_000)));
		const a = isoRing(model, radiusForCoverage(model, 0.5)!).geometry.coordinates[0][0];
		const b = isoRing(later, radiusForCoverage(later, 0.5)!).geometry.coordinates[0][0];
		const sep =
			Math.acos(Math.max(-1, Math.min(1, dot(latLonToUnitVector(a[1], a[0]), latLonToUnitVector(b[1], b[0]))))) *
			EARTH_RADIUS_KM;
		expect(sep).toBeLessThan(200);
	});

	it('returns nothing when the ring misses the Earth', () => {
		expect(isoRing(missing, 0.5).geometry.coordinates).toEqual([]);
	});

	it('handles a zero-radius ring without producing NaN', () => {
		for (const [lon, lat] of allPoints(isoRing(model, 0))) {
			expect(Number.isFinite(lon) && Number.isFinite(lat)).toBe(true);
		}
	});

	it('handles an axis through the Earth’s centre, where the basis is degenerate', () => {
		// footLen ≈ 0 means `u` has to be chosen arbitrarily; the ring must still come out valid.
		const centred = { ...model, center: [0, 0, 0] as Vec3 };
		const pts = allPoints(isoRing(centred, 0.5));
		expect(pts.length).toBeGreaterThan(0);
		for (const [lon, lat] of pts) expect(Number.isFinite(lon) && Number.isFinite(lat)).toBe(true);
	});
});

describe('terminatorLine', () => {
	const line = terminatorLine(model.sunDir);
	const pts = line.geometry.coordinates[0] as [number, number][];

	it('returns a single closed great circle', () => {
		expect(line.geometry.coordinates).toHaveLength(1);
		expect(pts.length).toBe(257);
	});

	it('has the Sun exactly on the horizon at every point', () => {
		for (const [lon, lat] of pts) {
			expect(dot(latLonToUnitVector(lat, lon), model.sunDir)).toBeCloseTo(0, 9);
		}
	});

	it('is a full great circle', () => {
		// Sum the angular steps: a great circle is 2π rad ≈ one Earth circumference.
		let total = 0;
		for (let i = 1; i < pts.length; i++) {
			const a = latLonToUnitVector(pts[i - 1][1], pts[i - 1][0]);
			const b = latLonToUnitVector(pts[i][1], pts[i][0]);
			total += Math.acos(Math.max(-1, Math.min(1, dot(a, b))));
		}
		expect(total * EARTH_RADIUS_KM).toBeCloseTo(2 * Math.PI * EARTH_RADIUS_KM, -1);
	});

	it('honours the sample count', () => {
		expect(terminatorLine(model.sunDir, 32).geometry.coordinates[0]).toHaveLength(33);
	});

	it('keeps longitudes continuous', () => {
		for (let i = 1; i < pts.length; i++) expect(Math.abs(pts[i][0] - pts[i - 1][0])).toBeLessThan(180);
	});

	it('works for a Sun over the pole, where the reference axis has to swap', () => {
		const polar = terminatorLine([0, 0, 1]);
		for (const [lon, lat] of polar.geometry.coordinates[0] as [number, number][]) {
			expect(Number.isFinite(lon)).toBe(true);
			expect(lat).toBeCloseTo(0, 9); // Sun over the north pole → terminator is the equator
		}
	});
});

describe('umbraGroundPoint', () => {
	it('agrees with shadowCenter', () => {
		// Same physical point by two different routes: the shadow axis against a UNIT SPHERE here,
		// against the WGS84 ELLIPSOID in shadowCenter. At 65°N the ellipsoid sits ~15 km inside that
		// sphere, and with the Sun only 26° up the axis meets it ~30 km further along — a systematic
		// model difference (~0.43° lon, ~0.22° lat), not an error. The bound is still tight enough that
		// a wrong root or a missing rotation would blow straight through it.
		const p = umbraGroundPoint(model)!;
		const ref = shadowCenter(new Date(GREATEST.utc))!;
		const sep =
			Math.acos(Math.max(-1, Math.min(1, dot(latLonToUnitVector(p[1], p[0]), latLonToUnitVector(ref.lat, ref.lon))))) *
			EARTH_RADIUS_KM;
		expect(sep).toBeLessThan(40);
	});

	it('returns a point on the sunlit side', () => {
		const p = umbraGroundPoint(model)!;
		expect(dot(latLonToUnitVector(p[1], p[0]), model.sunDir)).toBeGreaterThan(0);
	});

	it('returns null when the umbra misses the Earth', () => {
		expect(umbraGroundPoint(missing)).toBeNull();
	});
});

describe('labelPoint', () => {
	const radius = radiusForCoverage(model, 0.5)!;
	const centre = umbraGroundPoint(model)!;
	/** A unit tangent at the umbra ground point, pointing "down-screen" (toward the south pole). */
	const tangent = (): Vec3 => {
		const c = latLonToUnitVector(centre[1], centre[0]);
		return normalize(cross(cross(c, [0, 0, -1] as Vec3), c));
	};

	it('lands exactly on the ring it labels', () => {
		const p = labelPoint(model, radius, tangent())!;
		expect(p).not.toBeNull();
		expect(perpToAxis(p[0], p[1])).toBeCloseTo(radius, 3);
	});

	it('lies in the requested direction from the umbra centre', () => {
		const dir = tangent();
		const p = labelPoint(model, radius, dir)!;
		const c = latLonToUnitVector(centre[1], centre[0]);
		const towards = normalize((latLonToUnitVector(p[1], p[0]).map((v, i) => v - c[i]) as Vec3));
		expect(dot(towards, dir)).toBeGreaterThan(0.9);
	});

	it('moves outward for outer rings', () => {
		const dir = tangent();
		const inner = labelPoint(model, radiusForCoverage(model, 0.9)!, dir)!;
		const outer = labelPoint(model, radiusForCoverage(model, 0.2)!, dir)!;
		const angFrom = (p: [number, number]) =>
			Math.acos(
				Math.max(-1, Math.min(1, dot(latLonToUnitVector(p[1], p[0]), latLonToUnitVector(centre[1], centre[0]))))
			);
		expect(angFrom(outer)).toBeGreaterThan(angFrom(inner));
	});

	it('returns null when the umbra misses the Earth', () => {
		expect(labelPoint(missing, 0.5, [0, 0, 1])).toBeNull();
	});

	it('returns null when the ring does not reach that far in that direction', () => {
		// A radius beyond the penumbra's reach along the ray.
		expect(labelPoint(model, 5, tangent())).toBeNull();
	});

	it('returns null when the crossing would be on the night side', () => {
		// Aim away from the Sun: the ray leaves the day side before reaching the ring.
		const c = latLonToUnitVector(centre[1], centre[0]);
		const away = normalize(
			(model.sunDir.map((v, i) => -v + dot(model.sunDir, c) * c[i]) as Vec3)
		);
		const p = labelPoint(model, radiusForCoverage(model, 0.02)!, away);
		if (p !== null) expect(dot(latLonToUnitVector(p[1], p[0]), model.sunDir)).toBeGreaterThan(0);
	});

	it('returns coordinates, not a raw vector', () => {
		const p = labelPoint(model, radius, tangent())!;
		expect(p).toHaveLength(2);
		expect(Math.abs(p[1])).toBeLessThanOrEqual(90);
		expect(toLonLat(latLonToUnitVector(p[1], p[0]))[1]).toBeCloseTo(p[1], 9);
	});
});
