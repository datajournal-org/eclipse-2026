import { describe, it, expect } from 'vitest';
import { computeFraming, type SunArc, type Framing } from './framing';
import { DEG_TO_RAD, RAD_TO_DEG } from '$lib/constants';

const hFov = (vFov: number, aspect: number) => 2 * Math.atan(Math.tan((vFov * DEG_TO_RAD) / 2) * aspect) * RAD_TO_DEG;

const DESKTOP = 16 / 9;
const MOBILE = 360 / 480;

// A high Sun (Reykjavík, 24.6° at maximum) and a low one (Palma, 2.6°) — the two extremes on the path.
const HIGH: SunArc = { azMin: 240, azMax: 290, altMax: 24.6 };
const LOW: SunArc = { azMin: 275, azMax: 300, altMax: 2.6 };
// Far off the path the Sun is much higher: New York sees a 1 % partial with the Sun at 64°, which is the
// steepest the eclipse is seen from anywhere on Earth.
const NEW_YORK: SunArc = { azMin: 179, azMax: 234, altMax: 64 };

/**
 * Where an elevation lands in the frame, as a fraction of the frame height from the bottom (0 = bottom
 * edge, 1 = top). This is the inverse of the framing's own tangent mapping — the property every
 * expectation below is really about.
 */
function screenY(el: number, f: Framing): number {
	const ndc = Math.tan((el - f.aimEl) * DEG_TO_RAD) / Math.tan((f.fov * DEG_TO_RAD) / 2);
	return (ndc + 1) / 2;
}

/** The marker sits `camDep` below the camera's horizontal, by definition of camDep. */
const markerY = (f: Framing) => screenY(-f.camDep, f);

describe('computeFraming', () => {
	it('centres the shot on the middle of the azimuth span', () => {
		expect(computeFraming(HIGH, DESKTOP).meanAz).toBe(265);
		expect(computeFraming(LOW, DESKTOP).meanAz).toBe(287.5);
	});

	it('keeps the vertical FOV inside its design range', () => {
		for (const arc of [HIGH, LOW, NEW_YORK]) {
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

	it('puts the Sun near the top of the frame, wherever it is in the sky', () => {
		// The point of the whole module: from a Sun scraping the horizon to one 64° up, its highest
		// position always lands in the same place on screen.
		for (const arc of [LOW, HIGH, NEW_YORK, { azMin: 100, azMax: 140, altMax: 45 }]) {
			const f = computeFraming(arc, DESKTOP);
			expect(screenY(arc.altMax, f), `${arc.altMax}°`).toBeCloseTo(0.88, 2);
		}
	});

	it('keeps the marker in the bottom of the frame while the Sun is low enough to allow it', () => {
		for (const arc of [LOW, HIGH]) {
			const f = computeFraming(arc, DESKTOP);
			expect(markerY(f), `${arc.altMax}°`).toBeCloseTo(0.1, 2);
			expect(f.aimEl, `${arc.altMax}°`).toBeLessThan(0); // the classic shot looks DOWN at the marker
		}
	});

	it('tips the aim above the horizon and drops the camera for a Sun that is too high', () => {
		// New York: no downward-looking shot can reach a 64° Sun, so the camera sinks to eye level and the
		// view centre lifts into the sky (a MapLibre pitch past 90°).
		const f = computeFraming(NEW_YORK, DESKTOP);
		expect(f.aimEl).toBeGreaterThan(0);
		expect(f.camDep).toBeCloseTo(1.5, 6); // the floor: the camera cannot go below the marker's ground
		// The marker gives way — but only just: it is still inside the frame, below the horizon line.
		expect(markerY(f)).toBeGreaterThan(0);
		expect(markerY(f)).toBeLessThan(screenY(0, f));
	});

	it('raises the camera as the Sun sinks, never past its ceiling', () => {
		// camDep never rises with the Sun, and is clamped at both ends. In between it sits flat at the
		// preferred 30°: while the lens can still be opened, that is what absorbs a higher Sun.
		const deps = [-20, 0, 10, 25, 45, 64, 85].map(
			(altMax) => computeFraming({ azMin: 260, azMax: 280, altMax }, DESKTOP).camDep
		);
		for (let i = 1; i < deps.length; i++) expect(deps[i]).toBeLessThan(deps[i - 1] + 1e-6);
		expect(deps[0]).toBeCloseTo(45, 6); // a Sun below the horizon does not tip the shot straight down
		expect(deps[2]).toBeCloseTo(30, 6);
		expect(deps.at(-1)).toBeCloseTo(1.5, 6);
	});

	it('stops widening the lens for the marker once the camera can drop instead', () => {
		// Between the two regimes the FOV sits still at its cap: from a 45° Sun to New York's 64°, the
		// camera height is what absorbs the difference, not an ever wider lens.
		expect(computeFraming({ azMin: 260, azMax: 280, altMax: 45 }, DESKTOP).fov).toBe(75);
		expect(computeFraming(NEW_YORK, DESKTOP).fov).toBe(75);
	});

	it('opens the lens again to keep the horizon under a very high Sun', () => {
		// Bermuda's 70° Sun: at 75° of FOV the ground would be gone entirely, so the lens opens further
		// and the horizon line stays just inside the bottom edge.
		const f = computeFraming({ azMin: 200, azMax: 246, altMax: 69.6 }, DESKTOP);
		expect(f.fov).toBeGreaterThan(75);
		expect(screenY(0, f)).toBeGreaterThan(0);
		expect(screenY(0, f)).toBeCloseTo(0.05, 2);
		expect(screenY(69.6, f)).toBeCloseTo(0.88, 2);
	});

	it('gives up the ground only for a Sun that is almost overhead', () => {
		// A location where the eclipse is not visible at all can still put the Sun near the zenith
		// (Mexico City, ~85°). Nothing can hold both then — the Sun is what the frame keeps.
		const f = computeFraming({ azMin: 100, azMax: 140, altMax: 85 }, DESKTOP);
		expect(f.fov).toBe(88); // the ceiling, and still not enough
		expect(screenY(0, f)).toBeLessThan(0); // the horizon is below the frame
		expect(screenY(85, f)).toBeCloseTo(0.88, 2); // the Sun is not
	});

	it('never drops below the 50° floor for a Sun on the horizon', () => {
		expect(computeFraming({ azMin: 280, azMax: 290, altMax: 0 }, DESKTOP).fov).toBe(50);
	});

	it('fits the whole azimuth span horizontally, with margin', () => {
		// The point of the widening loop: the arc plus 8° of margin has to fit in the horizontal FOV.
		for (const arc of [HIGH, LOW, NEW_YORK, { azMin: 200, azMax: 320, altMax: 15 }]) {
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

	it('keeps the Sun framed even when the azimuth span widens the lens', () => {
		// Widening for the span changes the FOV after the fact; the aim and the camera are derived from
		// the FINAL value, so the Sun must still land on its mark.
		const arc: SunArc = { azMin: 200, azMax: 320, altMax: 15 };
		const f = computeFraming(arc, MOBILE);
		expect(f.fov).toBeGreaterThan(75); // the span forced it past the normal ceiling
		expect(screenY(arc.altMax, f)).toBeCloseTo(0.88, 2);
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
		// The base FOV is continuous and the loop adds 2 at a time, so a widened result is always
		// base + 2k. Pinning this makes a refactor to a continuous solve a deliberate change rather
		// than an accident.
		const arc: SunArc = { azMin: 250, azMax: 310, altMax: 15 };
		const base = computeFraming({ ...arc, azMax: arc.azMin }, MOBILE).fov;
		const widened = computeFraming(arc, MOBILE).fov;
		expect((widened - base) % 2).toBeCloseTo(0, 9);
	});
});
