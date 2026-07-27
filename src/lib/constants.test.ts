import { describe, it, expect } from 'vitest';
import { DEG_TO_RAD, RAD_TO_DEG, norm180, AU_KM, SUN_RADIUS_KM, MOON_RADIUS_KM, EARTH_RADIUS_KM, EARTH_RADIUS_M } from './constants';

describe('angle conversion', () => {
	it('round-trips degrees through radians', () => {
		expect(DEG_TO_RAD * RAD_TO_DEG).toBeCloseTo(1, 15);
		for (const deg of [-180, -37.5, 0, 1, 90, 359.9]) {
			expect(deg * DEG_TO_RAD * RAD_TO_DEG).toBeCloseTo(deg, 10);
		}
	});

	it('converts the landmark angles', () => {
		expect(180 * DEG_TO_RAD).toBeCloseTo(Math.PI, 15);
		expect(Math.PI * RAD_TO_DEG).toBeCloseTo(180, 12);
	});
});

describe('norm180', () => {
	// The wrap is the only thing in this module that can be wrong, and it is used for every longitude.
	it.each([
		[0, 0],
		[1, 1],
		[-1, -1],
		[179, 179],
		[181, -179],
		[359, -1],
		[360, 0],
		[361, 1],
		[-181, 179],
		[-359, 1],
		[-541, 179],
		[720, 0]
	])('norm180(%d) === %d', (input, expected) => {
		expect(norm180(input)).toBeCloseTo(expected, 10);
	});

	it('maps ±180 onto the same half-open endpoint', () => {
		// The interval is [-180, 180): both ends collapse to -180, so a meridian is never ambiguous.
		expect(norm180(180)).toBe(-180);
		expect(norm180(-180)).toBe(-180);
	});

	it('is idempotent', () => {
		for (const deg of [-541, -180, -0.5, 0, 90, 181, 1234]) {
			expect(norm180(norm180(deg))).toBeCloseTo(norm180(deg), 10);
		}
	});

	it('always lands inside [-180, 180)', () => {
		for (let deg = -1000; deg <= 1000; deg += 7.3) {
			const n = norm180(deg);
			expect(n).toBeGreaterThanOrEqual(-180);
			expect(n).toBeLessThan(180);
		}
	});
});

describe('physical constants', () => {
	it('keeps the documented magnitudes', () => {
		// Guards against a units slip (km vs m) — every distance in the app is derived from these.
		expect(AU_KM).toBeCloseTo(149597870.7, 1);
		expect(SUN_RADIUS_KM / EARTH_RADIUS_KM).toBeCloseTo(109.2, 1);
		expect(MOON_RADIUS_KM / EARTH_RADIUS_KM).toBeCloseTo(0.2727, 3);
		expect(EARTH_RADIUS_M).toBe(EARTH_RADIUS_KM * 1000);
	});

	it("gives the Sun an apparent radius of about a quarter degree at 1 AU", () => {
		expect(Math.asin(SUN_RADIUS_KM / AU_KM) * RAD_TO_DEG).toBeCloseTo(0.2666, 3);
	});
});
