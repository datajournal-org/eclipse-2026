import { describe, it, expect } from 'vitest';
import { buildTimeAxis } from './timeAxis';
import { buildTimeline } from './timeline';
import { localCircumstances, sunset } from '$lib/eclipse';
import { byName } from '$lib/testing/reference';

const t = (key: string) => key; // identity translator — the labels are the caller's business
const fmtTime = (d: Date) => d.toISOString().slice(11, 16);

const axisFor = (name: string) => {
	const site = byName(name);
	const lc = localCircumstances(site.lat, site.lon)!;
	const { times, N } = buildTimeline(site.lat, site.lon, lc);
	return {
		site,
		lc,
		times,
		N,
		axis: buildTimeAxis({ lc, sunset: sunset(site.lat, site.lon), times, N, t, fmtTime })
	};
};

describe('buildTimeAxis', () => {
	it('marks first and last contact for a partial eclipse, plus a standalone maximum', () => {
		const { axis } = axisFor('Berlin');
		expect(axis.ticks.map((tick) => tick.kind)).toEqual(['contact', 'max', 'contact']);
		expect(axis.ticks.map((tick) => tick.label)).toEqual(['b3.phase_start', 'b3.phase_max', 'b3.phase_end']);
		expect(axis.band).toBeNull();
	});

	it('replaces the maximum tick with a totality band for a total eclipse', () => {
		// Totality is ~2 min out of ~3 h — three separate ticks would collide, so it becomes one band.
		const { axis, lc } = axisFor('Oviedo');
		expect(axis.ticks.map((tick) => tick.kind)).toEqual(['contact', 'contact']);
		expect(axis.band).not.toBeNull();
		expect(axis.band!.from).toBeLessThan(axis.band!.peak);
		expect(axis.band!.peak).toBeLessThan(axis.band!.to);
		expect(axis.band!.sub).toBe(fmtTime(lc.peak!.time));
	});

	it('keeps the totality band narrow', () => {
		const { axis } = axisFor('Oviedo');
		expect(axis.band!.to - axis.band!.from).toBeLessThan(0.02);
		expect(axis.band!.to - axis.band!.from).toBeGreaterThan(0);
	});

	it('puts every fraction inside the track', () => {
		for (const name of ['Reykjavík', 'Oviedo', 'Palma', 'Berlin', 'München']) {
			const { axis } = axisFor(name);
			for (const tick of axis.ticks) {
				expect(tick.frac, `${name} ${tick.label}`).toBeGreaterThanOrEqual(0);
				expect(tick.frac, `${name} ${tick.label}`).toBeLessThanOrEqual(1);
			}
			if (axis.band) {
				expect(axis.band.from).toBeGreaterThanOrEqual(0);
				expect(axis.band.to).toBeLessThanOrEqual(1);
			}
			if (axis.sunsetFrac !== null) {
				expect(axis.sunsetFrac).toBeGreaterThanOrEqual(0);
				expect(axis.sunsetFrac).toBeLessThanOrEqual(1);
			}
		}
	});

	it('agrees between frac and frame', () => {
		for (const name of ['Berlin', 'Oviedo']) {
			const { axis, N } = axisFor(name);
			for (const tick of axis.ticks) expect(tick.frame).toBe(Math.round(tick.frac * N));
			if (axis.band) expect(axis.band.frame).toBe(Math.round(axis.band.peak * N));
		}
	});

	it('lands the frame on the right time', () => {
		const { axis, times, lc } = axisFor('Berlin');
		const startTick = axis.ticks.find((tick) => tick.kind === 'contact')!;
		expect(Math.abs(times[startTick.frame] - lc.partialBegin!.time.getTime())).toBeLessThan(60_000);
	});

	it('orders the ticks along the track', () => {
		const { axis } = axisFor('Berlin');
		const fracs = axis.ticks.map((tick) => tick.frac);
		expect(fracs).toEqual([...fracs].sort((a, b) => a - b));
	});

	it('aligns the edge labels inward so they do not clip', () => {
		const { axis } = axisFor('Berlin');
		expect(axis.ticks[0].align).toBe('start');
		expect(axis.ticks[axis.ticks.length - 1].align).toBe('end');
	});

	it('gives every tick a time as its second line', () => {
		const { axis } = axisFor('München');
		for (const tick of axis.ticks) expect(tick.sub).toMatch(/^\d\d:\d\d$/);
	});

	it('places a sunset tick when the Sun sets inside the window', () => {
		// Palma's eclipse runs into sunset — the tail below the horizon is the whole point of B3 there.
		const { axis, site, times, N } = axisFor('Palma');
		expect(axis.sunsetFrac).not.toBeNull();
		const s = sunset(site.lat, site.lon)!.getTime();
		expect(axis.sunsetFrac).toBeCloseTo((s - times[0]) / (times[N] - times[0]), 6);
		expect(axis.sunsetNote).toContain('b3.sunset');
	});

	it('notes the sunset but omits the tick when it falls outside the window', () => {
		// Reykjavík's Sun sets hours after the eclipse; a tick would sit off the end of the track.
		const { axis } = axisFor('Reykjavík');
		expect(axis.sunsetFrac).toBeNull();
		expect(axis.sunsetNote).toContain('b3.sunset');
	});

	it('omits both when there is no sunset at all', () => {
		const { times, N } = axisFor('Berlin');
		const lc = localCircumstances(52.52, 13.405)!;
		const axis = buildTimeAxis({ lc, sunset: null, times, N, t, fmtTime });
		expect(axis.sunsetFrac).toBeNull();
		expect(axis.sunsetNote).toBeNull();
	});

	it('reports the slider length it was given', () => {
		const { axis, N } = axisFor('Berlin');
		expect(axis.max).toBe(N);
	});

	it('degrades to an empty axis without local circumstances', () => {
		const { times, N } = axisFor('Berlin');
		const axis = buildTimeAxis({ lc: null, sunset: null, times, N, t, fmtTime });
		expect(axis.ticks).toEqual([]);
		expect(axis.band).toBeNull();
		expect(axis.max).toBe(N);
	});

	it('survives a zero-length window without dividing by zero', () => {
		const lc = localCircumstances(52.52, 13.405)!;
		const now = lc.peak!.time.getTime();
		const axis = buildTimeAxis({ lc, sunset: null, times: [now, now], N: 1, t, fmtTime });
		for (const tick of axis.ticks) expect(Number.isFinite(tick.frac)).toBe(true);
	});
});
