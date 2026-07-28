// The B3 time slider's window and its opening frame. The window is the local eclipse (first→last contact)
// padded by 10 min each side; the opening frame is greatest eclipse, except where the eclipse is very deep
// (>90%) — there the peak is near-black, so we open at the moment coverage first reaches 90% on the way in.
import { ECLIPSE_DATE } from '$lib/config';
import { eclipseGeometry } from '$lib/skyview/eclipseGeometry';

type LocalCircumstances = ReturnType<typeof import('$lib/eclipse').localCircumstances>;

const PAD = 10 * 60 * 1000; // 10 min of padding on each side, so the slider shows the run-up and wind-down
const START_OBSC = 0.9; // deep eclipses open here (on the way in) rather than at the near-black peak

/**
 * One slider frame = 10 s, exactly. The RESOLUTION is fixed and the frame count follows from the window,
 * not the other way round: a fixed N (originally 240) made the step depend on the window's length —
 * ~33 s at Oviedo — which was too coarse for the events that make totality dramatic: the plunge into
 * darkness takes ~30 s, second contact to third is ~100 s, and each was only a frame or three wide.
 *
 * The window is snapped OUTWARD onto the 10 s grid (start floored, end ceiled), so every frame is a
 * whole multiple of STEP_MS since the epoch: the step is exactly 10 000 ms with no float division, and
 * displayed clock times tick on round seconds instead of the window's arbitrary phase.
 */
const STEP_MS = 10_000;

export function buildTimeline(
	lat: number,
	lon: number,
	lc: LocalCircumstances
): { N: number; times: number[]; startFrame: number } {
	const tStart = lc?.partialBegin?.time ?? new Date(ECLIPSE_DATE + 'T16:30:00Z');
	const tEnd = lc?.partialEnd?.time ?? new Date(ECLIPSE_DATE + 'T19:00:00Z');

	const iStart = Math.floor((tStart.getTime() - PAD) / STEP_MS);
	const iEnd = Math.ceil((tEnd.getTime() + PAD) / STEP_MS);
	
	const N = Math.max(1, iEnd - iStart);
	const times = Array.from({ length: N + 1 }, (_, i) => (iStart + i) * STEP_MS);

	const peakT = (lc?.peak?.time ?? new Date(ECLIPSE_DATE + 'T18:08:00Z')).getTime();
	const peakFrame = Math.round(peakT / STEP_MS - iStart);
	let startFrame = peakFrame;
	if ((lc?.obscuration ?? 0) > START_OBSC) {
		for (let i = 0; i <= peakFrame; i++) {
			if (eclipseGeometry(lat, lon, new Date(times[i])).obsc >= START_OBSC) {
				startFrame = i;
				break;
			}
		}
	}
	return { N, times, startFrame };
}
