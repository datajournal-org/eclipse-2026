// Event markers for the B3 time slider: maps the local eclipse's contact times onto the slider's [0..1]
// track. Totality is a ~2-min sliver between totalBegin/peak/totalEnd, so on a true-time axis it is drawn
// as one band (not three colliding ticks). Sunset gets a tick + a below-horizon tail only when it falls
// inside the slider window; otherwise just an end note. Pure — labels/times are passed in already resolved.
import type { Tick, TimeBand } from '$lib/components/timeScrubber';

type Lc = ReturnType<typeof import('$lib/eclipse').localCircumstances>;

export type TimeAxis = {
	ticks: Tick[];
	band: TimeBand | null;
	sunsetFrac: number | null; // tick + below-horizon tail, only when sunset is within the window
	sunsetNote: string | null; // always shown when a sunset exists
	max: number; // slider frame count (N)
};

export function buildTimeAxis(opts: {
	lc: Lc;
	sunset: Date | null;
	times: number[];
	N: number;
	t: (key: string) => string;
	fmtTime: (d: Date) => string;
}): TimeAxis {
	const { lc, sunset, times, N, t, fmtTime } = opts;
	const evStart = times[0];
	const evEnd = times[N];
	const span = evEnd - evStart || 1;
	const frac = (d: Date) => Math.max(0, Math.min(1, (d.getTime() - evStart) / span));
	const frameOf = (d: Date) => Math.round(frac(d) * N);
	const isTotal = !!(lc?.totalBegin && lc?.totalEnd);

	const ticks: Tick[] = [];
	if (lc?.partialBegin)
		ticks.push({
			frac: frac(lc.partialBegin.time),
			frame: frameOf(lc.partialBegin.time),
			label: t('b3.phase_start'),
			sub: fmtTime(lc.partialBegin.time),
			align: 'start',
			kind: 'contact'
		});
	// only a standalone Maximum tick when there's no totality band to carry it
	if (!isTotal && lc?.peak)
		ticks.push({
			frac: frac(lc.peak.time),
			frame: frameOf(lc.peak.time),
			label: t('b3.phase_max'),
			sub: fmtTime(lc.peak.time),
			align: 'center',
			kind: 'max'
		});
	if (lc?.partialEnd)
		ticks.push({
			frac: frac(lc.partialEnd.time),
			frame: frameOf(lc.partialEnd.time),
			label: t('b3.phase_end'),
			sub: fmtTime(lc.partialEnd.time),
			align: 'end',
			kind: 'contact'
		});

	let band: TimeBand | null = null;
	if (isTotal && lc?.totalBegin && lc?.totalEnd && lc?.peak)
		band = {
			from: frac(lc.totalBegin.time),
			to: frac(lc.totalEnd.time),
			peak: frac(lc.peak.time),
			frame: frameOf(lc.peak.time),
			label: t('b3.phase_max'),
			sub: fmtTime(lc.peak.time)
		};

	let sunsetFrac: number | null = null;
	let sunsetNote: string | null = null;
	if (sunset) {
		sunsetNote = `${t('b2.sunset')} · ${fmtTime(sunset)}`;
		const s0 = sunset.getTime();
		if (s0 >= evStart && s0 <= evEnd) sunsetFrac = frac(sunset);
	}

	return { ticks, band, sunsetFrac, sunsetNote, max: N };
}
