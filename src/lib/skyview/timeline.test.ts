import { describe, it, expect } from 'vitest';
import { buildTimeline } from './timeline';
import { localCircumstances } from '$lib/eclipse';
import { eclipseGeometry } from './eclipseGeometry';
import { byName } from '$lib/testing/reference';

const PAD_MS = 10 * 60 * 1000;
const lcOf = (name: string) => {
	const site = byName(name);
	return { site, lc: localCircumstances(site.lat, site.lon)! };
};

describe('buildTimeline', () => {
	it('spans first-to-last contact plus 10 min of padding each side', () => {
		// The padded window is snapped OUTWARD onto the 10 s grid, so the ends cover the padding fully
		// and overshoot it by less than one step.
		const { site, lc } = lcOf('Berlin');
		const { times, N } = buildTimeline(site.lat, site.lon, lc);
		const first = lc.partialBegin!.time.getTime() - PAD_MS;
		const last = lc.partialEnd!.time.getTime() + PAD_MS;
		expect(times[0]).toBeLessThanOrEqual(first);
		expect(times[0]).toBeGreaterThan(first - 10_000);
		expect(times[N]).toBeGreaterThanOrEqual(last);
		expect(times[N]).toBeLessThan(last + 10_000);
	});

	it('puts every frame on a whole 10 s of UTC', () => {
		// The grid property: frame times are multiples of the step since the epoch, so the step is exactly
		// 10 000 ms (integer arithmetic, no float accumulation) and displayed clocks tick on round seconds.
		for (const name of ['Reykjavík', 'Oviedo', 'Berlin']) {
			const { site, lc } = lcOf(name);
			const { times } = buildTimeline(site.lat, site.lon, lc);
			for (const t of times) expect(t % 10_000, name).toBe(0);
		}
	});

	it('produces N + 1 frames exactly 10 s apart', () => {
		const { site, lc } = lcOf('Oviedo');
		const { times, N } = buildTimeline(site.lat, site.lon, lc);
		// The resolution is fixed and N follows from the window: totality's own events (a ~30 s plunge,
		// ~100 s of darkness) need finer steps than the ~33 s a fixed N=240 gave this window.
		expect(N).toBe((times[N] - times[0]) / 10_000);
		expect(times).toHaveLength(N + 1);
		for (let i = 1; i <= N; i++) expect(times[i] - times[i - 1]).toBe(10_000);
	});

	it('rises monotonically', () => {
		const { site, lc } = lcOf('Palma');
		const { times } = buildTimeline(site.lat, site.lon, lc);
		for (let i = 1; i < times.length; i++) expect(times[i]).toBeGreaterThan(times[i - 1]);
	});

	it('opens at maximum for a shallow eclipse', () => {
		// Below the 90 % threshold the peak is the most interesting frame, so that's where it opens.
		// Berlin, not somewhere further out: a location the 2026 eclipse misses now returns null, by design.
		const site = byName('Berlin');
		const shallow = localCircumstances(site.lat, site.lon)!;
		expect(shallow.obscuration).toBeLessThan(0.9);
		const { times, startFrame } = buildTimeline(site.lat, site.lon, shallow);
		expect(Math.abs(times[startFrame] - shallow.peak!.time.getTime())).toBeLessThan(60_000);
	});

	it('opens on the way in for a deep eclipse, not at the near-black peak', () => {
		const { site, lc } = lcOf('Oviedo');
		const { times, startFrame } = buildTimeline(site.lat, site.lon, lc);
		expect(times[startFrame]).toBeLessThan(lc.peak!.time.getTime());
		// and exactly at the first frame that has reached 90 % coverage
		expect(eclipseGeometry(site.lat, site.lon, new Date(times[startFrame])).obsc).toBeGreaterThanOrEqual(0.9);
		expect(eclipseGeometry(site.lat, site.lon, new Date(times[startFrame - 1])).obsc).toBeLessThan(0.9);
	});

	it('keeps the opening frame inside the window', () => {
		for (const name of ['Reykjavík', 'Oviedo', 'Palma', 'Berlin', 'München']) {
			const { site, lc } = lcOf(name);
			const { startFrame, N } = buildTimeline(site.lat, site.lon, lc);
			expect(startFrame, name).toBeGreaterThanOrEqual(0);
			expect(startFrame, name).toBeLessThanOrEqual(N);
		}
	});

	it('contains every contact time', () => {
		for (const name of ['Reykjavík', 'Oviedo', 'Palma', 'Berlin', 'München']) {
			const { site, lc } = lcOf(name);
			const { times, N } = buildTimeline(site.lat, site.lon, lc);
			for (const ev of [lc.partialBegin, lc.totalBegin, lc.peak, lc.totalEnd, lc.partialEnd]) {
				if (!ev) continue;
				expect(ev.time.getTime(), name).toBeGreaterThanOrEqual(times[0]);
				expect(ev.time.getTime(), name).toBeLessThanOrEqual(times[N]);
			}
		}
	});

	it('falls back to a sensible window when there are no local circumstances', () => {
		// The un-located / no-eclipse case must still give the slider something to render.
		const { times, N, startFrame } = buildTimeline(0, 0, null);
		expect(N).toBe(1020); // 2 h 50 min of fallback window at 10 s per frame
		expect(times).toHaveLength(1021);
		expect(new Date(times[0]).toISOString()).toBe('2026-08-12T16:20:00.000Z');
		expect(new Date(times[N]).toISOString()).toBe('2026-08-12T19:10:00.000Z');
		expect(startFrame).toBeGreaterThan(0);
		expect(startFrame).toBeLessThan(N);
	});
});
