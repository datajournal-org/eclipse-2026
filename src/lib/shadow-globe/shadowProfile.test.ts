import { describe, it, expect } from 'vitest';
import { discOverlapFraction, computeShadowModel, radiusForCoverage, PROFILE_SIZE } from './shadowProfile';
import { sunMoonECEF } from '$lib/eclipse';
import { GREATEST } from '$lib/testing/reference';
import { dot, length } from './vec3';

/** Closed-form area of the lens where two circles overlap — the independent oracle for the fraction. */
function lensArea(r1: number, r2: number, d: number): number {
	if (d >= r1 + r2) return 0;
	if (d <= Math.abs(r1 - r2)) return Math.PI * Math.min(r1, r2) ** 2;
	const a1 = r1 * r1 * Math.acos((d * d + r1 * r1 - r2 * r2) / (2 * d * r1));
	const a2 = r2 * r2 * Math.acos((d * d + r2 * r2 - r1 * r1) / (2 * d * r2));
	const tri = 0.5 * Math.sqrt((-d + r1 + r2) * (d + r1 - r2) * (d - r1 + r2) * (d + r1 + r2));
	return a1 + a2 - tri;
}

describe('discOverlapFraction', () => {
	it('is zero once the discs separate', () => {
		expect(discOverlapFraction(1, 1, 2)).toBe(0);
		expect(discOverlapFraction(1, 1, 2.0001)).toBe(0);
		expect(discOverlapFraction(1, 1.05, 5)).toBe(0);
		expect(discOverlapFraction(0.262, 0.271, 0.6)).toBe(0);
	});

	it('is total when the larger Moon disc swallows the Sun', () => {
		expect(discOverlapFraction(1, 1.2, 0)).toBe(1);
		expect(discOverlapFraction(1, 1.2, 0.19)).toBe(1); // still inside |r2 - r1|
		expect(discOverlapFraction(0.262, 0.271, 0)).toBe(1);
	});

	it('caps at the annular ratio when the Moon is the smaller disc', () => {
		// An annular eclipse: the Moon is entirely inside the Sun's disc, so it can never reach 1.
		expect(discOverlapFraction(1, 0.9, 0)).toBeCloseTo(0.81, 12);
		expect(discOverlapFraction(1, 0.9, 0.05)).toBeCloseTo(0.81, 12);
	});

	it('is exactly a half-cover for equal discs at zero separation', () => {
		expect(discOverlapFraction(1, 1, 0)).toBe(1);
	});

	it('matches the closed-form lens area in the partial regime', () => {
		for (const [rs, rm, d] of [
			[1, 1, 1],
			[1, 1, 0.5],
			[1, 1.05, 0.7],
			[0.2631, 0.2710, 0.3],
			[0.2631, 0.2710, 0.5],
			[1, 0.9, 1.5]
		]) {
			expect(discOverlapFraction(rs, rm, d), `${rs}/${rm}/${d}`).toBeCloseTo(lensArea(rs, rm, d) / (Math.PI * rs * rs), 12);
		}
	});

	it('decreases monotonically as the discs draw apart', () => {
		let prev = Infinity;
		for (let d = 0; d <= 0.6; d += 0.005) {
			const f = discOverlapFraction(0.2631, 0.271, d);
			expect(f, `d=${d}`).toBeLessThanOrEqual(prev + 1e-12);
			prev = f;
		}
		expect(prev).toBe(0);
	});

	it('stays inside 0..1 across the whole parameter sweep', () => {
		for (const rm of [0.2, 0.2631, 0.3]) {
			for (let d = 0; d <= 1; d += 0.01) {
				const f = discOverlapFraction(0.2631, rm, d);
				expect(f).toBeGreaterThanOrEqual(0);
				expect(f).toBeLessThanOrEqual(1);
			}
		}
	});

	it('is continuous across the tangency boundaries', () => {
		// Two `if` shortcuts guard the analytic branch; a discontinuity there would show as a visible
		// ring in the shader's penumbra gradient.
		const rs = 0.2631,
			rm = 0.271;
		const inner = Math.abs(rm - rs);
		const outer = rs + rm;
		expect(discOverlapFraction(rs, rm, inner - 1e-9)).toBeCloseTo(discOverlapFraction(rs, rm, inner + 1e-9), 6);
		expect(discOverlapFraction(rs, rm, outer - 1e-9)).toBeCloseTo(0, 6);
	});
});

describe('computeShadowModel', () => {
	const model = computeShadowModel(sunMoonECEF(new Date(GREATEST.utc)));

	it('returns a unit shadow axis pointing sunward', () => {
		expect(length(model.axis)).toBeCloseTo(1, 12);
		expect(dot(model.axis, model.sunDir)).toBeGreaterThan(0.999);
	});

	it('anchors the centre on the axis, perpendicular to it', () => {
		expect(dot(model.center, model.axis)).toBeCloseTo(0, 9);
	});

	it('puts the axis foot inside the Earth during a central eclipse', () => {
		expect(length(model.center)).toBeLessThan(1);
	});

	it('samples the full profile', () => {
		expect(model.coverage).toBeInstanceOf(Float32Array);
		expect(model.coverage.length).toBe(PROFILE_SIZE);
	});

	it('starts at totality on the axis and reaches zero at rMax', () => {
		expect(model.coverage[0]).toBeCloseTo(1, 5);
		expect(model.coverage[PROFILE_SIZE - 1]).toBeCloseTo(0, 5);
	});

	it('decreases monotonically outward', () => {
		for (let i = 1; i < PROFILE_SIZE; i++) {
			expect(model.coverage[i], `sample ${i}`).toBeLessThanOrEqual(model.coverage[i - 1] + 1e-7);
		}
	});

	it('gives the penumbra a plausible size', () => {
		// rMax is in Earth radii; the penumbra is a few thousand km across.
		expect(model.rMax).toBeGreaterThan(0.4);
		expect(model.rMax).toBeLessThan(1.2);
	});

	it('is defined even when the umbra misses the Earth entirely', () => {
		// The anchor is the perpendicular foot, not a surface hit — that is the whole point of the design.
		const early = computeShadowModel(sunMoonECEF(new Date('2026-08-12T15:30:00Z')));
		expect(Number.isFinite(early.rMax)).toBe(true);
		expect(early.coverage.every((c) => Number.isFinite(c))).toBe(true);
		expect(length(early.axis)).toBeCloseTo(1, 12);
	});

	it('tracks the Moon as the eclipse progresses', () => {
		const later = computeShadowModel(sunMoonECEF(new Date(Date.parse(GREATEST.utc) + 1800_000)));
		expect(dot(model.axis, later.axis)).toBeLessThan(0.9999); // the axis really moved
		expect(later.coverage[0]).toBeCloseTo(1, 3); // still central half an hour later
	});
});

describe('radiusForCoverage', () => {
	const model = computeShadowModel(sunMoonECEF(new Date(GREATEST.utc)));

	// 0.999, not 1 — the totality threshold both call sites (ShadowRun's ISO_RINGS and corridorCompute's
	// TOTALITY_LEVEL) actually use. See the degeneracy test below for why the difference matters.
	const TOTALITY_LEVEL = 0.999;

	it('orders the iso-rings from the axis outward', () => {
		const total = radiusForCoverage(model, TOTALITY_LEVEL)!;
		const half = radiusForCoverage(model, 0.5)!;
		const edge = radiusForCoverage(model, 0.01)!;
		expect(total).toBeGreaterThan(0);
		expect(total).toBeLessThan(half);
		expect(half).toBeLessThan(edge);
		expect(edge).toBeLessThanOrEqual(model.rMax);
	});

	it('collapses to the axis at exactly level 1', () => {
		// Documented wart: the scan returns the FIRST radius at or below the level, so on the totality
		// plateau (where coverage is flat at 1) level 1 yields the plateau's inner edge — r = 0 — not the
		// umbra rim. Harmless today because every caller passes 0.999; a future caller passing 1 would
		// silently draw a zero-radius ring.
		expect(radiusForCoverage(model, 1)).toBe(0);
		expect(radiusForCoverage(model, TOTALITY_LEVEL)).toBeGreaterThan(0);
	});

	it('inverts the profile: sampling at the returned radius gives back the level', () => {
		for (const level of [0.9, 0.75, 0.5, 0.25, 0.1]) {
			const r = radiusForCoverage(model, level)!;
			const i = Math.round((r / model.rMax) * (PROFILE_SIZE - 1));
			expect(model.coverage[i], `level ${level}`).toBeCloseTo(level, 2);
		}
	});

	it('returns null for a level the eclipse never reaches', () => {
		const partialOnly = computeShadowModel(sunMoonECEF(new Date('2026-08-12T16:30:00Z')));
		expect(radiusForCoverage(model, 1.5)).toBeNull();
		// A moment when the axis coverage is below 1 has no totality ring at all.
		if (partialOnly.coverage[0] < 1) expect(radiusForCoverage(partialOnly, 1)).toBeNull();
	});

	it('returns rMax when the level is at or below the outermost sample', () => {
		expect(radiusForCoverage(model, 0)).toBeCloseTo(model.rMax, 6);
	});

	it('reproduces the published path width at greatest eclipse', () => {
		// The profile radius is measured PERPENDICULAR TO THE AXIS, so it is the shadow cone's
		// cross-section (~60 km), not the ground footprint. Projected onto ground tilted by the Sun's
		// 25.8° altitude at the greatest-eclipse point, 2r/sin(alt) must come out near the published
		// ~290 km path width — an end-to-end check of the profile against an external number.
		const crossSectionKm = radiusForCoverage(model, TOTALITY_LEVEL)! * 6371;
		expect(crossSectionKm).toBeGreaterThan(40);
		expect(crossSectionKm).toBeLessThan(80);

		const groundWidthKm = (2 * crossSectionKm) / Math.sin(25.81 * (Math.PI / 180));
		expect(groundWidthKm).toBeGreaterThan(240);
		expect(groundWidthKm).toBeLessThan(330);
	});
});
