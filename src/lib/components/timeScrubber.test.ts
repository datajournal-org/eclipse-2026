import { describe, it, expect } from 'vitest';
import { buildTimeGrid } from './timeScrubber';
import { TIMELINE_START, TIMELINE_END, FRAME_STEP_MS } from '$lib/config';

const label = (ms: number) => new Date(ms).toISOString().slice(11, 16);
const A2 = {
	start: TIMELINE_START.getTime(),
	end: TIMELINE_END.getTime(),
	len: (TIMELINE_END.getTime() - TIMELINE_START.getTime()) / FRAME_STEP_MS + 1,
	stepMin: 30,
	label
};

describe('buildTimeGrid', () => {
	it('marks the clock half-hours across the A2 window', () => {
		expect(buildTimeGrid(A2).map((t) => t.label)).toEqual(['17:00', '17:30', '18:00', '18:30']);
	});

	it('snaps to clock boundaries rather than to the window start', () => {
		// A ruler that started at 16:45 and stepped 30 min would read 16:45 / 17:15 / … — useless as
		// a clock. The first tick is the first :00/:30 at or after the start.
		const ticks = buildTimeGrid({ ...A2, start: Date.UTC(2026, 7, 12, 16, 47) });
		expect(ticks[0].label).toBe('17:00');
	});

	it('includes a boundary that coincides exactly with the start', () => {
		const ticks = buildTimeGrid({ ...A2, start: Date.UTC(2026, 7, 12, 17, 0) });
		expect(ticks[0].label).toBe('17:00');
		expect(ticks[0].frac).toBe(0);
	});

	it('includes a boundary that coincides exactly with the end', () => {
		const ticks = buildTimeGrid({ ...A2, end: Date.UTC(2026, 7, 12, 18, 30) });
		expect(ticks[ticks.length - 1].label).toBe('18:30');
		expect(ticks[ticks.length - 1].frac).toBe(1);
	});

	it('positions every tick proportionally', () => {
		const span = A2.end - A2.start;
		for (const tick of buildTimeGrid(A2)) {
			const expected = (Date.parse(`2026-08-12T${tick.label}:00Z`) - A2.start) / span;
			expect(tick.frac, tick.label).toBeCloseTo(expected, 12);
		}
	});

	it('keeps every tick inside the track and inside the frame range', () => {
		for (const stepMin of [5, 15, 30, 60]) {
			for (const tick of buildTimeGrid({ ...A2, stepMin })) {
				expect(tick.frac, `${stepMin}min`).toBeGreaterThanOrEqual(0);
				expect(tick.frac, `${stepMin}min`).toBeLessThanOrEqual(1);
				expect(tick.frame, `${stepMin}min`).toBeGreaterThanOrEqual(0);
				expect(tick.frame, `${stepMin}min`).toBeLessThanOrEqual(A2.len - 1);
			}
		}
	});

	it('maps fractions onto frames consistently', () => {
		for (const tick of buildTimeGrid(A2)) expect(tick.frame).toBe(Math.round(tick.frac * (A2.len - 1)));
	});

	it('rises monotonically and never repeats a frame', () => {
		const ticks = buildTimeGrid({ ...A2, stepMin: 15 });
		for (let i = 1; i < ticks.length; i++) {
			expect(ticks[i].frac).toBeGreaterThan(ticks[i - 1].frac);
			expect(ticks[i].frame).toBeGreaterThan(ticks[i - 1].frame);
		}
	});

	it('nudges the outermost labels inward so they do not clip', () => {
		// frac < 0.06 → 'start', frac > 0.94 → 'end', everything else centred on its tick.
		const ticks = buildTimeGrid({ ...A2, start: Date.UTC(2026, 7, 12, 17, 0), end: Date.UTC(2026, 7, 12, 18, 30) });
		expect(ticks[0].align).toBe('start');
		expect(ticks[ticks.length - 1].align).toBe('end');
		expect(ticks[1].align).toBe('center');
	});

	it('tags every tick as grid and leaves the second line empty', () => {
		for (const tick of buildTimeGrid(A2)) {
			expect(tick.kind).toBe('grid');
			expect(tick.sub).toBeUndefined();
		}
	});

	it('scales the tick count with the step', () => {
		expect(buildTimeGrid({ ...A2, stepMin: 60 })).toHaveLength(2);
		expect(buildTimeGrid({ ...A2, stepMin: 15 })).toHaveLength(9); // 16:45 is itself a quarter-hour
		expect(buildTimeGrid({ ...A2, stepMin: 10 })).toHaveLength(12);
	});

	it('returns nothing when no boundary falls inside the window', () => {
		const ticks = buildTimeGrid({
			...A2,
			start: Date.UTC(2026, 7, 12, 17, 1),
			end: Date.UTC(2026, 7, 12, 17, 29)
		});
		expect(ticks).toEqual([]);
	});

	it('survives a zero-length window without dividing by zero', () => {
		const now = Date.UTC(2026, 7, 12, 17, 0);
		const ticks = buildTimeGrid({ ...A2, start: now, end: now });
		for (const tick of ticks) expect(Number.isFinite(tick.frac)).toBe(true);
	});

	it('passes the raw timestamp to the label formatter', () => {
		const seen: number[] = [];
		buildTimeGrid({ ...A2, label: (ms) => (seen.push(ms), '') });
		expect(seen).toHaveLength(4);
		for (const ms of seen) expect(ms % (30 * 60_000)).toBe(0);
	});
});
