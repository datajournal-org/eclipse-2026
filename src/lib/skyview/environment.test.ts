import { describe, it, expect } from 'vitest';
import { environment, duskVeil, DUSK_HEX } from './environment';

describe('environment', () => {
	it('is full daylight with no eclipse', () => {
		const e = environment(0);
		expect(e.brightness).toBe(1);
		expect(e.veil).toBe(0);
	});

	it('reaches its deepest veil at totality', () => {
		const e = environment(1);
		expect(e.brightness).toBe(0);
		// Deliberately a range, not the literal: MAX_VEIL is a look-and-feel dial (it came down from 0.97
		// to 0.88 when totality turned out to render as pure black rather than deep twilight). What must
		// hold is that totality is heavily veiled but not totally opaque — a real one is not black.
		expect(e.veil).toBeGreaterThan(0.8);
		expect(e.veil).toBeLessThan(0.95);
	});

	it('stays gentle through the partial phase', () => {
		// The steep exponent is the whole design: 80 % coverage still looks like a slightly odd
		// afternoon, which is what people actually report.
		expect(environment(0.5).veil).toBeLessThan(0.01);
		expect(environment(0.8).veil).toBeLessThan(0.15);
		expect(environment(0.9).veil).toBeLessThan(0.4);
	});

	it('plunges over the last few percent', () => {
		expect(environment(0.99).veil).toBeGreaterThan(0.8);
		expect(environment(1).veil - environment(0.95).veil).toBeGreaterThan(0.3);
	});

	it('rises monotonically with obscuration', () => {
		let prev = -1;
		for (let o = 0; o <= 1; o += 0.02) {
			const v = environment(o).veil;
			expect(v, `obsc ${o}`).toBeGreaterThanOrEqual(prev);
			prev = v;
		}
	});

	it('keeps veil and brightness complementary', () => {
		// Derived from the function itself rather than hard-coded, so re-tuning the depth of totality does
		// not break a test that is really about the two staying in step.
		const maxVeil = environment(1).veil;
		for (let o = 0; o <= 1; o += 0.1) {
			const e = environment(o);
			expect(e.veil / maxVeil).toBeCloseTo(1 - e.brightness, 12);
		}
	});

	it('clamps out-of-range obscuration', () => {
		expect(environment(-1)).toEqual(environment(0));
		expect(environment(2)).toEqual(environment(1));
		expect(environment(Number.NEGATIVE_INFINITY).veil).toBe(0);
	});

	it('holds the directional light constant', () => {
		// Documented decision: the veil owns all eclipse dimming, so buildings and terrain darken at the
		// same rate. A light that tracked the eclipse would make buildings run ahead of the ground.
		const light = environment(0);
		for (const o of [0.25, 0.5, 0.9, 1]) {
			expect(environment(o).light).toBe(light.light);
			expect(environment(o).intensity).toBe(light.intensity);
		}
	});

	it('exports the dusk colour as a hex triple', () => {
		expect(DUSK_HEX).toMatch(/^#[0-9a-f]{6}$/i);
	});
});

describe('duskVeil', () => {
	it('is clear while the Sun is well up', () => {
		expect(duskVeil(30)).toBe(0);
		expect(duskVeil(8)).toBe(0);
	});

	it('is near-complete once the Sun is well down', () => {
		expect(duskVeil(-6)).toBeCloseTo(0.9, 6);
		expect(duskVeil(-30)).toBeCloseTo(0.9, 6);
	});

	it('ramps in between +8° and -6°', () => {
		expect(duskVeil(4)).toBeGreaterThan(0);
		expect(duskVeil(4)).toBeLessThan(0.9);
		expect(duskVeil(0)).toBeGreaterThan(duskVeil(4));
		expect(duskVeil(-3)).toBeGreaterThan(duskVeil(0));
	});

	it('is monotonically non-increasing in altitude', () => {
		let prev = 1;
		for (let alt = -10; alt <= 20; alt += 0.5) {
			// walking upward, the veil must never increase
			const v = duskVeil(alt);
			expect(v, `alt ${alt}`).toBeLessThanOrEqual(prev + 1e-12);
			prev = v;
		}
	});

	it('eases in with no visible pop at either end', () => {
		// smoothstep: the derivative vanishes at both ends, so the veil must not jump across the
		// threshold — a hard edge there would be visible as the Sun crosses 8°.
		expect(Math.abs(duskVeil(8.01) - duskVeil(7.99))).toBeLessThan(1e-4);
		expect(Math.abs(duskVeil(-5.99) - duskVeil(-6.01))).toBeLessThan(1e-4);
		// and mid-ramp it moves clearly faster than at the ends
		expect(Math.abs(duskVeil(1.1) - duskVeil(0.9))).toBeGreaterThan(1e-2);
	});

	it('is exactly half-dimmed at the midpoint of the ramp', () => {
		expect(duskVeil(1)).toBeCloseTo(0.45, 6);
	});

	it('stays inside 0..0.9 everywhere', () => {
		for (let alt = -90; alt <= 90; alt += 1) {
			expect(duskVeil(alt)).toBeGreaterThanOrEqual(0);
			expect(duskVeil(alt)).toBeLessThanOrEqual(0.9);
		}
	});
});
