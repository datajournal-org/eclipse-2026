import { describe, it, expect } from 'vitest';
import type { Vec3 } from '$lib/types';
import {
	dot,
	cross,
	length,
	normalize,
	sub,
	negate,
	lerp,
	offset,
	clamp,
	toLonLat,
	latLonToUnitVector,
	destPoint
} from './vec3';
import { DEG_TO_RAD, EARTH_RADIUS_M } from '$lib/constants';

const X: Vec3 = [1, 0, 0];
const Y: Vec3 = [0, 1, 0];
const Z: Vec3 = [0, 0, 1];

const expectVec = (actual: Vec3, expected: Vec3, digits = 12) => {
	for (let i = 0; i < 3; i++) expect(actual[i], `component ${i}`).toBeCloseTo(expected[i], digits);
};

describe('vector algebra', () => {
	it('dot', () => {
		expect(dot(X, X)).toBe(1);
		expect(dot(X, Y)).toBe(0);
		expect(dot([1, 2, 3], [4, -5, 6])).toBe(4 - 10 + 18);
	});

	it('cross follows the right-hand rule', () => {
		expectVec(cross(X, Y), Z);
		expectVec(cross(Y, Z), X);
		expectVec(cross(Z, X), Y);
		expectVec(cross(Y, X), [0, 0, -1]);
	});

	it('cross is orthogonal to both inputs and vanishes for parallel ones', () => {
		const a: Vec3 = [1, 2, 3];
		const b: Vec3 = [-4, 5, 0.5];
		const c = cross(a, b);
		expect(dot(c, a)).toBeCloseTo(0, 12);
		expect(dot(c, b)).toBeCloseTo(0, 12);
		expectVec(cross(a, a), [0, 0, 0]);
	});

	it('length', () => {
		expect(length([3, 4, 0])).toBe(5);
		expect(length([0, 0, 0])).toBe(0);
		expect(length([1, 1, 1])).toBeCloseTo(Math.sqrt(3), 12);
	});

	it('normalize returns a unit vector', () => {
		expect(length(normalize([3, 4, 0]))).toBeCloseTo(1, 12);
		expectVec(normalize([0, 0, 7]), Z);
	});

	it('normalize leaves the zero vector alone instead of producing NaN', () => {
		// The `|| 1` guard in normalize exists for exactly this; NaNs would silently poison whole rings.
		expectVec(normalize([0, 0, 0]), [0, 0, 0]);
	});

	it('sub and negate', () => {
		expectVec(sub([1, 2, 3], [0.5, -2, 3]), [0.5, 4, 0]);
		expectVec(negate([1, -2, 0]), [-1, 2, -0]);
	});

	it('lerp hits both endpoints and the midpoint', () => {
		const a: Vec3 = [0, 0, 0];
		const b: Vec3 = [10, -4, 2];
		expectVec(lerp(a, b, 0), a);
		expectVec(lerp(a, b, 1), b);
		expectVec(lerp(a, b, 0.5), [5, -2, 1]);
	});

	it('lerp extrapolates outside 0..1', () => {
		expectVec(lerp([0, 0, 0], [2, 0, 0], 2), [4, 0, 0]);
		expectVec(lerp([0, 0, 0], [2, 0, 0], -1), [-2, 0, 0]);
	});

	it('clamp', () => {
		expect(clamp(5, 0, 10)).toBe(5);
		expect(clamp(-1, 0, 10)).toBe(0);
		expect(clamp(11, 0, 10)).toBe(10);
		expect(clamp(0, 0, 0)).toBe(0);
	});
});

describe('offset', () => {
	it('rotates a unit vector by rho toward a perpendicular direction', () => {
		expectVec(offset(X, Y, Math.PI / 2), Y);
		expectVec(offset(X, Y, 0), X);
		expectVec(offset(X, Y, Math.PI / 4), [Math.SQRT1_2, Math.SQRT1_2, 0]);
	});

	it('preserves unit length', () => {
		for (const rho of [0.01, 0.5, 1, 2, 3]) {
			expect(length(offset(Z, X, rho))).toBeCloseTo(1, 12);
		}
	});

	it('produces the requested angular separation', () => {
		const rho = 0.7;
		expect(Math.acos(dot(offset(X, Z, rho), X))).toBeCloseTo(rho, 12);
	});
});

describe('geographic conversion', () => {
	it('places the landmark directions', () => {
		expectVec(latLonToUnitVector(0, 0), X);
		expectVec(latLonToUnitVector(0, 90), Y);
		expectVec(latLonToUnitVector(90, 0), Z);
		expectVec(latLonToUnitVector(-90, 0), [0, 0, -1]);
		expectVec(latLonToUnitVector(0, 180), [-1, 0, 0]);
	});

	it('always returns a unit vector', () => {
		for (let lat = -90; lat <= 90; lat += 15) {
			for (let lon = -180; lon <= 180; lon += 30) {
				expect(length(latLonToUnitVector(lat, lon)), `${lat}/${lon}`).toBeCloseTo(1, 12);
			}
		}
	});

	it('round-trips lat/lon through the unit sphere', () => {
		for (let lat = -85; lat <= 85; lat += 5) {
			for (let lon = -175; lon <= 175; lon += 5) {
				const [gotLon, gotLat] = toLonLat(latLonToUnitVector(lat, lon));
				expect(gotLat, `lat ${lat}/${lon}`).toBeCloseTo(lat, 9);
				expect(gotLon, `lon ${lat}/${lon}`).toBeCloseTo(lon, 9);
			}
		}
	});

	it('round-trips across the antimeridian', () => {
		// atan2 returns +180 for both sides of the seam; the latitude must still survive.
		for (const lon of [180, -180]) {
			const [gotLon, gotLat] = toLonLat(latLonToUnitVector(12.5, lon));
			expect(Math.abs(gotLon)).toBeCloseTo(180, 9);
			expect(gotLat).toBeCloseTo(12.5, 9);
		}
	});

	it('handles the poles without NaN', () => {
		for (const lat of [90, -90]) {
			const [, gotLat] = toLonLat(latLonToUnitVector(lat, 42));
			expect(gotLat).toBeCloseTo(lat, 9);
		}
	});

	it('clamps a slightly out-of-range z instead of returning NaN from asin', () => {
		// Accumulated float error can push a "unit" vector marginally past 1.
		const [, lat] = toLonLat([0, 0, 1 + 1e-12]);
		expect(lat).toBeCloseTo(90, 9);
	});
});

describe('destPoint', () => {
	it('moves due north by the expected latitude increment', () => {
		// 1 km along a meridian ≈ 1000 / (R * π/180) degrees of latitude.
		const [lon, lat] = destPoint(0, 0, 0, 1000);
		expect(lon).toBeCloseTo(0, 9);
		expect(lat).toBeCloseTo(1000 / (EARTH_RADIUS_M * DEG_TO_RAD), 6);
	});

	it('moves due south with the opposite sign', () => {
		const [, north] = destPoint(0, 0, 0, 5000);
		const [, south] = destPoint(0, 0, 180, 5000);
		expect(south).toBeCloseTo(-north, 9);
	});

	it('converges the meridians toward the pole', () => {
		// The same eastward distance spans twice the longitude at 60°N as at the equator (cos 60° = 0.5).
		const [lonEq] = destPoint(0, 0, 90, 10_000);
		const [lon60] = destPoint(60, 0, 90, 10_000);
		expect(lon60 / lonEq).toBeCloseTo(2, 2);
	});

	it('returns to the start when walking back', () => {
		const [lon1, lat1] = destPoint(48.1372, 11.5756, 33, 40_000);
		// Reverse bearing along a great circle is not simply bearing+180 over long distances, so
		// walk back with the bearing measured at the destination.
		const initial = 33 * DEG_TO_RAD;
		const back =
			(Math.atan2(
				Math.sin((11.5756 - lon1) * DEG_TO_RAD) * Math.cos(48.1372 * DEG_TO_RAD),
				Math.cos(lat1 * DEG_TO_RAD) * Math.sin(48.1372 * DEG_TO_RAD) -
					Math.sin(lat1 * DEG_TO_RAD) * Math.cos(48.1372 * DEG_TO_RAD) * Math.cos((11.5756 - lon1) * DEG_TO_RAD)
			) *
				180) /
			Math.PI;
		const [lon2, lat2] = destPoint(lat1, lon1, back, 40_000);
		expect(lat2).toBeCloseTo(48.1372, 6);
		expect(lon2).toBeCloseTo(11.5756, 6);
		expect(initial).toBeTruthy();
	});

	it('is a no-op for zero distance', () => {
		const [lon, lat] = destPoint(52.52, 13.405, 217, 0);
		expect(lat).toBeCloseTo(52.52, 12);
		expect(lon).toBeCloseTo(13.405, 12);
	});

	it('travels the requested great-circle distance', () => {
		const from: Vec3 = latLonToUnitVector(43.3603, -5.8448);
		for (const dist of [500, 50_000, 500_000]) {
			const [lon, lat] = destPoint(43.3603, -5.8448, 71, dist);
			const angle = Math.acos(clamp(dot(from, latLonToUnitVector(lat, lon)), -1, 1));
			expect(angle * EARTH_RADIUS_M, `${dist} m`).toBeCloseTo(dist, 3);
		}
	});

	it('crosses the antimeridian without a jump in position', () => {
		const [lon, lat] = destPoint(0, 179.9, 90, 50_000);
		// The raw longitude may exceed 180; what matters is that the point is still on the sphere and
		// half a degree further east once normalised.
		expect(lat).toBeCloseTo(0, 9);
		expect(((lon + 540) % 360) - 180).toBeCloseTo(-179.65, 1);
	});
});
