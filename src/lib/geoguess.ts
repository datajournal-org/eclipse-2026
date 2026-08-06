// A starting location, guessed from the browser's time zone, so the app opens on a real sky instead of
// on an empty "choose a location" prompt. No network, no permission dialog, nothing stored: `Intl`
// already knows the zone, and the zone → city table is compiled in (see scripts/data/README.md).
//
// The guess is deliberately coarse — it is a whole time zone's representative city, not the reader's
// address — which is why it carries `source: 'guess'` and B0 says where it came from.
import { TZ_PLACES, TZ_ALIAS } from '$lib/data/timezones.generated';
import type { TzPlace } from '$lib/data/timezoneTable';
import { localCircumstances, eclipseVisible } from '$lib/eclipse';
import type { Place } from '$lib/place';

/**
 * Own keys only. `'toString' in TZ_PLACES` is TRUE — both tables are plain object literals, so `in`
 * walks the prototype — and destructuring the function it returns throws. This runs synchronously at
 * module load, so that throw would take the whole page down rather than degrade to the showcase.
 */
const lookup = (zone: string): TzPlace | undefined => {
	if (Object.hasOwn(TZ_PLACES, zone)) return TZ_PLACES[zone];
	const target = Object.hasOwn(TZ_ALIAS, zone) ? TZ_ALIAS[zone] : undefined;
	return target !== undefined && Object.hasOwn(TZ_PLACES, target) ? TZ_PLACES[target] : undefined;
};

/**
 * Where a reader lands when their own place cannot work — a zone the 2026 eclipse never reaches, an
 * unknown zone, or no zone at all. Burgos: inside the corridor, 107 s of totality, the Sun 8.3° up, and
 * a real city, so B3 has buildings to put the Sun behind rather than empty terrain.
 *
 * Not the OG card's Madrid point: that one is a 99.96 % PARTIAL, and a showcase should show the thing
 * the app is about. Not Oviedo either, which the test fixtures already use as "the chosen place" — a
 * showcase that collides with the fixture would let a broken fallback pass unnoticed.
 */
export const SHOWCASE: Place = { lat: 42.3439, lon: -3.6969, name: 'Burgos', source: 'showcase' };

/** The browser's IANA zone, or null where `Intl` is unavailable or unhelpful. */
export function currentZone(): string | null {
	try {
		return Intl.DateTimeFormat().resolvedOptions().timeZone || null;
	} catch {
		return null;
	}
}

/**
 * Resolve a zone to a place. Every failure converges on SHOWCASE, which is the point: there is no
 * un-located state left to fall back to.
 *
 * The alias step is what makes this work outside Chrome. ECMA-402 no longer requires
 * `resolvedOptions().timeZone` to be canonicalised, so engines still report `Asia/Calcutta`,
 * `Europe/Kiev` or `US/Pacific`.
 */
export function guessPlace(zone: string | null = currentZone()): Place {
	const row = zone ? lookup(zone) : undefined;
	if (!row) return SHOWCASE;

	const [lat, lon, name] = row;
	// A guessed place the eclipse misses would open the app on "not visible from here" — technically
	// true, and the worst possible first screen. Show a working sky and say it is an example.
	if (!eclipseVisible(localCircumstances(lat, lon))) return SHOWCASE;
	return { lat, lon, name, source: 'guess' };
}
