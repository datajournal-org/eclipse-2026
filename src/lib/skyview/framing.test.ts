import { describe, it, expect } from 'vitest';
import { computeFraming, type SunArc } from './framing';
import { DEG_TO_RAD, RAD_TO_DEG } from '$lib/constants';

const hFov = (vFov: number, aspect: number) => 2 * Math.atan(Math.tan((vFov * DEG_TO_RAD) / 2) * aspect) * RAD_TO_DEG;

const DESKTOP = 16 / 9;
const MOBILE = 360 / 480;

// A high Sun (Reykjavík, 24.6° at maximum) and a low one (Palma, 2.6°) — the two extremes on the path.
const HIGH: SunArc = { azMin: 240, azMax: 290, altMax: 24.6 };
const LOW: SunArc = { azMin: 275, azMax: 300, altMax: 2.6 };

describe('computeFraming', () => {
	it('centres the shot on the middle of the azimuth span', () => {
		expect(computeFraming(HIGH, DESKTOP).meanAz).toBe(265);
		expect(computeFraming(LOW, DESKTOP).meanAz).toBe(287.5);
	});

	it('keeps the vertical FOV inside its design range', () => {
		for (const arc of [HIGH, LOW]) {
			for (const aspect of [MOBILE, 1, DESKTOP, 3]) {
				const { fov } = computeFraming(arc, aspect);
				expect(fov, `${arc.altMax}/${aspect}`).toBeGreaterThanOrEqual(50);
				expect(fov, `${arc.altMax}/${aspect}`).toBeLessThan(90);
			}
		}
	});

	it('gives a higher Sun a wider vertical FOV', () => {
		expect(computeFraming(HIGH, DESKTOP).fov).toBeGreaterThan(computeFraming(LOW, DESKTOP).fov);
	});

	it('clamps the headroom so an extreme Sun does not blow the FOV open', () => {
		// altTop is clamped to 8..32°, so a hypothetical overhead Sun frames the same as a 29° one.
		const overhead = computeFraming({ azMin: 100, azMax: 140, altMax: 89 }, DESKTOP);
		const high = computeFraming({ azMin: 100, azMax: 140, altMax: 29 }, DESKTOP);
		expect(overhead.fov).toBe(high.fov);
		expect(overhead.fov).toBeLessThanOrEqual(70); // 70 is the pre-widening cap; this arc never widens
	});

	it('never drops below the 50° floor for a Sun on the horizon', () => {
		expect(computeFraming({ azMin: 280, azMax: 290, altMax: 0 }, DESKTOP).fov).toBe(50);
	});

	it('fits the whole azimuth span horizontally, with margin', () => {
		// The point of the widening loop: the arc plus 8° of margin has to fit in the horizontal FOV.
		for (const arc of [HIGH, LOW, { azMin: 200, azMax: 320, altMax: 15 }]) {
			for (const aspect of [MOBILE, 1, DESKTOP]) {
				const { fov } = computeFraming(arc, aspect);
				const span = arc.azMax - arc.azMin;
				const fits = hFov(fov, aspect) >= span + 8;
				// Either it fits, or the loop hit its 88° ceiling trying.
				expect(fits || fov >= 88, `${span}° span at aspect ${aspect}`).toBe(true);
			}
		}
	});

	it('needs a wider FOV on a narrow viewport than on a wide one', () => {
		const arc: SunArc = { azMin: 250, azMax: 310, altMax: 15 }; // 60° span: fits on desktop, not on mobile
		const wide = computeFraming(arc, DESKTOP);
		const narrow = computeFraming(arc, MOBILE);
		expect(narrow.fov).toBeGreaterThan(wide.fov);
		expect(hFov(wide.fov, DESKTOP)).toBeGreaterThanOrEqual(68);
		expect(hFov(narrow.fov, MOBILE)).toBeGreaterThanOrEqual(68);
	});

	it('stops widening just short of 90°', () => {
		// A pathological arc must not spin the loop forever or return a nonsense FOV. The guard is
		// `fov < 88` checked BEFORE the += 2, so the result can land just under 90 but never at or past it.
		const { fov } = computeFraming({ azMin: 0, azMax: 350, altMax: 10 }, 0.3);
		expect(Number.isFinite(fov)).toBe(true);
		expect(fov).toBeLessThan(90);
		expect(fov).toBeGreaterThanOrEqual(88);
	});

	it('handles a degenerate arc', () => {
		const { fov, meanAz } = computeFraming({ azMin: 270, azMax: 270, altMax: 5 }, DESKTOP);
		expect(meanAz).toBe(270);
		expect(fov).toBe(50);
	});

	it('treats a reversed arc as zero-span rather than negative', () => {
		// azMax < azMin should not produce a negative span that shrinks the FOV below the floor.
		const { fov } = computeFraming({ azMin: 300, azMax: 250, altMax: 5 }, DESKTOP);
		expect(fov).toBeGreaterThanOrEqual(50);
	});

	it('widens in whole 2° steps from the clamped base', () => {
		// The base FOV is continuous ((BETA + altTop) / 0.46) and the loop adds 2 at a time, so a
		// widened result is always base + 2k. Pinning this makes a refactor to a continuous solve a
		// deliberate change rather than an accident.
		const arc: SunArc = { azMin: 250, azMax: 310, altMax: 15 };
		const base = computeFraming({ ...arc, azMax: arc.azMin }, MOBILE).fov;
		const widened = computeFraming(arc, MOBILE).fov;
		expect((widened - base) % 2).toBeCloseTo(0, 9);
	});
});
