// The shape of a location, split out of stores/location.ts so that geoguess.ts can produce one without
// importing the store that consumes it. Everything still imports it THROUGH the store (which re-exports
// both) — this file exists to break the cycle, not to add a second public name.

/**
 * Where a location came from. The distinction is not cosmetic: it decides what the UI may claim and
 * what may be written to the device.
 *
 * - `user` — chosen in the dialog, or supplied by the `?lat&lon` debug override. The ONLY kind that is
 *   ever persisted: storage means "this reader told us", so a guess must never end up there.
 * - `guess` — derived from the browser's time zone. Good enough to open the app on a real sky, not good
 *   enough to present as the reader's own, so B0 says where it came from.
 * - `showcase` — the fixed demo place, used when the guessed zone cannot see the eclipse at all. B0 says
 *   so plainly; claiming it as the reader's location would be a lie.
 */
export type PlaceSource = 'user' | 'guess' | 'showcase';

export type Place = { lat: number; lon: number; name: string | null; source: PlaceSource };

/**
 * How a place is shown wherever a name may be missing: the name, else its coordinates.
 *
 * Takes the shape without `source`, because provenance has nothing to do with a label — the dialog
 * labels its pending pin with this too, and that pin is not a Place until it is committed.
 */
export const placeLabel = (p: Omit<Place, 'source'>): string => p.name ?? `${p.lat.toFixed(3)}°, ${p.lon.toFixed(3)}°`;
