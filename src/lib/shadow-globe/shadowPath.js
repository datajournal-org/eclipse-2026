// The whole central shadow path (the dashed reference "Pfad") and the timeline frames the
// slider scrubs through. Pure math, computed once at module load (also at prerender time).

import { shadowCenter } from '$lib/eclipse';

// The umbra touches Earth roughly 17:00–18:32 UTC. We start the timeline at 17:30: before that
// the umbra sits on the polar cap, where MapLibre's globe line rendering breaks up (vector data
// clamps to the ±85° Mercator limit).
const TIMELINE_START_UTC = Date.UTC(2026, 7, 12, 17, 30);
const TIMELINE_END_UTC = Date.UTC(2026, 7, 12, 19, 0);
const FRAME_STEP_MS = 30 * 1000;

/** @typedef {{ time: number, lat: number, lon: number }} ShadowFrame */

/** @returns {ShadowFrame[]} one frame per 30 s where the umbra actually reaches Earth */
function computeFrames() {
  const frames = [];
  for (let time = TIMELINE_START_UTC; time <= TIMELINE_END_UTC; time += FRAME_STEP_MS) {
    const center = shadowCenter(new Date(time));
    if (center) frames.push({ time, lat: center.lat, lon: center.lon });
  }
  return frames;
}

/** Timeline frames: timestamp + umbra ground position, one per slider step. */
export const shadowFrames = computeFrames();

/** GeoJSON of the whole central path — drawn as the faint dashed "Pfad" reference line. */
export const shadowPathLine = {
  type: 'Feature',
  geometry: { type: 'LineString', coordinates: shadowFrames.map((f) => [f.lon, f.lat]) }
};

export const timelineStart = shadowFrames[0].time;
export const timelineEnd = shadowFrames[shadowFrames.length - 1].time;

/** A timestamp as "HH:MM" in UTC. */
export const formatUtc = (ms) => new Date(ms).toISOString().slice(11, 16);
