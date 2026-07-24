// The whole central shadow path (the "Pfad" reference line) and the timeline frames the slider
// scrubs through. Pure math, computed once at module load (also at prerender time).

import type { Feature, LineString } from 'geojson';
import { shadowCenter } from '$lib/eclipse';
import { TIMELINE_START, TIMELINE_END, FRAME_STEP_MS } from '$lib/config';

export type ShadowFrame = { time: number };

/** Every frame across the configured window — the slider spans all of them. */
function computeFrames(): ShadowFrame[] {
	const frames: ShadowFrame[] = [];
	for (let time = TIMELINE_START.getTime(); time <= TIMELINE_END.getTime(); time += FRAME_STEP_MS) {
		frames.push({ time });
	}
	return frames;
}

/** Timeline frames, one per slider step. */
export const shadowFrames = computeFrames();

/** GeoJSON of the umbra track (central line) — only the frames where the umbra reaches Earth. */
function computePathLine(): Feature<LineString> {
	const coordinates: [number, number][] = [];
	for (const { time } of shadowFrames) {
		const center = shadowCenter(new Date(time));
		if (center) coordinates.push([center.lon, center.lat]);
	}
	return { type: 'Feature', geometry: { type: 'LineString', coordinates }, properties: null };
}

export const shadowPathLine = computePathLine();

export const timelineStart = shadowFrames[0].time;
export const timelineEnd = shadowFrames[shadowFrames.length - 1].time;

/** A timestamp as "HH:MM" in UTC. */
export const formatUtc = (ms: number) => new Date(ms).toISOString().slice(11, 16);
