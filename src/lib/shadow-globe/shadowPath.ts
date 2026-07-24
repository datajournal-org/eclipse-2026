// The whole central shadow path (the dashed reference "Pfad") and the timeline frames the
// slider scrubs through. Pure math, computed once at module load (also at prerender time).

import type { Feature, LineString } from 'geojson';
import { shadowCenter } from '$lib/eclipse';
import { TIMELINE_START, TIMELINE_END, FRAME_STEP_MS } from '$lib/config';

export type ShadowFrame = { time: number; lat: number; lon: number };

/** One frame per step across the configured window, keeping only where the umbra reaches Earth. */
function computeFrames(): ShadowFrame[] {
	const frames: ShadowFrame[] = [];
	for (let time = TIMELINE_START.getTime(); time <= TIMELINE_END.getTime(); time += FRAME_STEP_MS) {
		const center = shadowCenter(new Date(time));
		if (center) frames.push({ time, lat: center.lat, lon: center.lon });
	}
	return frames;
}

/** Timeline frames: timestamp + umbra ground position, one per slider step. */
export const shadowFrames = computeFrames();

/** GeoJSON of the whole central path — drawn as the faint dashed "Pfad" reference line. */
export const shadowPathLine: Feature<LineString> = {
	type: 'Feature',
	geometry: { type: 'LineString', coordinates: shadowFrames.map((f) => [f.lon, f.lat]) },
	properties: null
};

export const timelineStart = shadowFrames[0].time;
export const timelineEnd = shadowFrames[shadowFrames.length - 1].time;

/** A timestamp as "HH:MM" in UTC. */
export const formatUtc = (ms: number) => new Date(ms).toISOString().slice(11, 16);
