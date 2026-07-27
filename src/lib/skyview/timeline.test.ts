import { describe, it, expect } from 'vitest';
import { buildTimeline } from './timeline';
import { localCircumstances } from '$lib/eclipse';
import { eclipseGeometry } from './eclipseGeometry';
import { byName } from '$lib/testing/reference';

const PAD_MS = 30 * 60 * 1000;
const lcOf = (name: string) => {
	const site = byName(name);
	return { site, lc: localCircumstances(site.lat, site.lon)! };
};

describe('buildTimeline', () => {
	it('spans first-to-last contact plus 30 min of padding each side', () => {
		const { site, lc } = lcOf('Berlin');
		const { times, N } = buildTimeline(site.lat, site.lon, lc);
		expect(times[0]).toBe(lc.partialBegin!.time.getTime() - PAD_MS);
		expect(times[N]).toBe(lc.partialEnd!.time.getTime() + PAD_MS);
	});

	it('produces N + 1 evenly spaced frames', () => {
		const { site, lc } = lcOf('Oviedo');
		const { times, N } = buildTimeline(site.lat, site.lon, lc);
		expect(N).toBe(240);
		expect(times).toHaveLength(241);
		// Frames are computed as start + span * i / N, so the gaps agree to float precision, not exactly.
		const step = times[1] - times[0];
		for (let i = 1; i <= N; i++) expect(times[i] - times[i - 1]).toBeCloseTo(step, 3);
	});

	it('rises monotonically', () => {
		const { site, lc } = lcOf('Palma');
		const { times } = buildTimeline(site.lat, site.lon, lc);
		for (let i = 1; i < times.length; i++) expect(times[i]).toBeGreaterThan(times[i - 1]);
	});

	it('opens at maximum for a shallow eclipse', () => {
		// Below the 90 % threshold the peak is the most interesting frame, so that's where it opens.
		const ATHENS = { lat: 37.9838, lon: 23.7275 };
		const shallow = localCircumstances(ATHENS.lat, ATHENS.lon)!;
		expect(shallow.obscuration).toBeLessThan(0.9);
		const { times, startFrame } = buildTimeline(ATHENS.lat, ATHENS.lon, shallow);
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
		expect(times).toHaveLength(241);
		expect(new Date(times[0]).toISOString()).toBe('2026-08-12T16:00:00.000Z');
		expect(new Date(times[N]).toISOString()).toBe('2026-08-12T19:30:00.000Z');
		expect(startFrame).toBeGreaterThan(0);
		expect(startFrame).toBeLessThan(N);
	});
});
