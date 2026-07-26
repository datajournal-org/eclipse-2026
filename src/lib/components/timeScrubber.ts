// Shared types + helpers for the TimeScrubber component, used by both the A2 globe (regular time grid) and
// the B3 sky view (eclipse event markers + totality band). Keeping them here lets both screens feed the one
// slider component the same shape.

export type Tick = {
	frac: number; // position on the track, 0..1
	frame: number; // slider frame to jump to when tapped
	label: string;
	sub?: string; // optional second line (e.g. the time under a phase name); omitted for grid ticks
	align: 'start' | 'center' | 'end';
	kind: 'contact' | 'max' | 'grid';
};

export type TimeBand = {
	from: number;
	to: number;
	peak: number; // Maximum, drawn as a ◆ on the band
	frame: number; // jump target for the band label
	label: string;
	sub?: string; // the Maximum time, shown under the band label
};

// Regular time-grid ticks (e.g. every 30 min) across a slider window — a plain ruler, tappable to jump.
export function buildTimeGrid(opts: {
	start: number;
	end: number;
	len: number; // number of slider frames
	stepMin: number;
	label: (ms: number) => string;
}): Tick[] {
	const { start, end, len, stepMin, label } = opts;
	const span = end - start || 1;
	const step = stepMin * 60_000;
	const ticks: Tick[] = [];
	// first grid boundary at or after start (30-min steps land on :00/:30 relative to the epoch → clock marks)
	for (let t = Math.ceil(start / step) * step; t <= end; t += step) {
		const frac = (t - start) / span;
		ticks.push({
			frac,
			frame: Math.round(frac * (len - 1)),
			label: label(t),
			align: frac < 0.06 ? 'start' : frac > 0.94 ? 'end' : 'center',
			kind: 'grid'
		});
	}
	return ticks;
}
