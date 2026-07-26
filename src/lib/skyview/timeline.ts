// The B3 time slider's window and its opening frame. The window is the local eclipse (first→last contact)
// padded by 30 min each side; the opening frame is greatest eclipse, except where the eclipse is very deep
// (>90%) — there the peak is near-black, so we open at the moment coverage first reaches 90% on the way in.
import { ECLIPSE_DATE } from '$lib/config';
import { eclipseGeometry } from '$lib/skyview/eclipseGeometry';

type LocalCircumstances = ReturnType<typeof import('$lib/eclipse').localCircumstances>;

const PAD = 30 * 60 * 1000; // 30 min of padding on each side, so the slider shows the run-up and wind-down
const START_OBSC = 0.9; // deep eclipses open here (on the way in) rather than at the near-black peak

export function buildTimeline(
	lat: number,
	lon: number,
	lc: LocalCircumstances
): { N: number; times: number[]; startFrame: number } {
	const tStart = (lc?.partialBegin?.time ?? new Date(ECLIPSE_DATE + 'T16:30:00Z')).getTime() - PAD;
	const tEnd = (lc?.partialEnd?.time ?? new Date(ECLIPSE_DATE + 'T19:00:00Z')).getTime() + PAD;
	const N = 240;
	const times = Array.from({ length: N + 1 }, (_, i) => tStart + ((tEnd - tStart) * i) / N);

	const peakT = (lc?.peak?.time ?? new Date(ECLIPSE_DATE + 'T18:08:00Z')).getTime();
	const peakFrame = Math.round(((peakT - tStart) / (tEnd - tStart)) * N);
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
