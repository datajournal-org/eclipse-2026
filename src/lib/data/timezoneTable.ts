/**
 * Parsing and rendering for the IANA time-zone → representative-city table.
 *
 * Split out of `scripts/build-timezones.ts` for the same reason `corridorModule.ts` is split out of
 * `build-corridor.ts`: the interesting part is the parsing, and it should be unit-testable without
 * touching the filesystem. The script is the thin wrapper that reads `scripts/data/` and writes
 * `timezones.generated.ts`.
 *
 * Input formats (see scripts/data/README.md for provenance):
 *   zone1970.tab / zone.tab   `CODES \t ±DDMM±DDDMM \t Zone/Name \t optional comment`
 *   backward                  `Link \t Target/Zone \t Alias/Zone \t optional comment`
 */

/** A zone's representative city: the coordinates the tz database gives it, and its name. */
export type TzPlace = readonly [lat: number, lon: number, city: string];

export type TimezoneTable = {
	places: Record<string, TzPlace>;
	/** Deprecated or renamed zone ids → a key of `places`. Never dangling. */
	aliases: Record<string, string>;
};

// ISO 6709 as the tab files write it: ±DDMM±DDDMM, or ±DDMMSS±DDDMMSS where a zone needs the seconds.
const COORD = /^([+-])(\d{2})(\d{2})(\d{2})?([+-])(\d{3})(\d{2})(\d{2})?$/;

const dms = (sign: string, deg: string, min: string, sec: string | undefined): number => {
	// The sign has to be applied to the whole angle, not to the degrees: "-0019" is 19 arcminutes SOUTH,
	// and Number('-00') is -0, which would silently turn it into +0.317°.
	const v = Number(deg) + Number(min) / 60 + (sec ? Number(sec) / 3600 : 0);
	return sign === '-' ? -v : v;
};

/** ~1.1 km. The source is minute-precise anyway, and this is a guess for a whole time zone. */
const round = (v: number) => Math.round(v * 100) / 100;

export function parseCoordinates(s: string): { lat: number; lon: number } | null {
	const m = COORD.exec(s.trim());
	if (!m) return null;
	return { lat: round(dms(m[1], m[2], m[3], m[4])), lon: round(dms(m[5], m[6], m[7], m[8])) };
}

/** "Europe/Berlin" → "Berlin"; "America/Argentina/Buenos_Aires" → "Buenos Aires". */
export function cityName(zone: string): string {
	return zone.slice(zone.lastIndexOf('/') + 1).replaceAll('_', ' ');
}

/** Rows of a zone.tab / zone1970.tab, in file order, skipping comments and malformed lines. */
export function parseZoneTab(text: string): { zone: string; lat: number; lon: number }[] {
	const out: { zone: string; lat: number; lon: number }[] = [];
	for (const line of text.split('\n')) {
		if (!line || line.startsWith('#')) continue;
		const [, coords, zone] = line.split('\t');
		if (!coords || !zone) continue;
		const c = parseCoordinates(coords);
		if (c) out.push({ zone: zone.trim(), ...c });
	}
	return out;
}

/** `Link` lines of the `backward` file, as alias → target. */
export function parseBackward(text: string): { alias: string; target: string }[] {
	const out: { alias: string; target: string }[] = [];
	for (const line of text.split('\n')) {
		if (!line.startsWith('Link')) continue;
		const [, target, alias] = line.split(/\s+/);
		if (target && alias) out.push({ alias, target });
	}
	return out;
}

/** Same city, to within ~2 km — far tighter than any two zones the database actually distinguishes. */
const SAME_PLACE_DEG = 0.02;

/**
 * Build the lookup. `primary` (the current zone1970.tab) wins wherever both files carry a zone, so
 * ordinary updates come from the current release; `supplement` (the frozen 2022a zone.tab) only fills
 * in the zones the post-2022 merges deleted — see scripts/data/README.md.
 *
 * `backward` links come in two flavours and they need opposite treatment:
 *
 *   - a **rename** (`Europe/Kiev` → `Europe/Kyiv`) links two ids for the SAME point. The supplement
 *     still carries the old id, so without this it would keep its own entry and label a Ukrainian
 *     reader's sky "Kiev" forever. Coordinates decide: if the link's two ends agree, the old id gives
 *     up its entry and becomes an alias, so the current name wins.
 *   - a **merge** (`Europe/Oslo` → `Europe/Berlin`) links two genuinely different cities that happened
 *     to keep the same clock since 1970. Those must keep the supplement's own coordinates: Oslo is
 *     750 km from Berlin and the eclipse looks materially different there.
 *
 * An alias is emitted only when the zone has no entry of its own AND its target does, so `aliases[z]`
 * can never dangle.
 */
export function buildTimezoneTable(primary: string, supplement: string, backward: string): TimezoneTable {
	const places: Record<string, TzPlace> = {};
	for (const { zone, lat, lon } of [...parseZoneTab(supplement), ...parseZoneTab(primary)]) {
		places[zone] = [lat, lon, cityName(zone)];
	}

	const links = parseBackward(backward);
	for (const { alias, target } of links) {
		const a = places[alias];
		const b = places[target];
		if (!a || !b) continue;
		if (Math.abs(a[0] - b[0]) <= SAME_PLACE_DEG && Math.abs(a[1] - b[1]) <= SAME_PLACE_DEG) {
			delete places[alias];
		}
	}

	const aliases: Record<string, string> = {};
	for (const { alias, target } of links) {
		if (alias in places || !(target in places)) continue;
		aliases[alias] = target;
	}

	return { places: sorted(places), aliases: sorted(aliases) };
}

const sorted = <T>(o: Record<string, T>): Record<string, T> =>
	Object.fromEntries(Object.entries(o).sort(([a], [b]) => (a < b ? -1 : 1)));

export function renderTimezoneModule(table: TimezoneTable, releases: string): string {
	const entry = ([zone, [lat, lon, city]]: [string, TzPlace]) => `\t'${zone}': [${lat}, ${lon}, '${city}'],`;
	return `// GENERATED by scripts/build-timezones.ts — do not edit by hand; run \`npm run precompute\`.
// Representative city of every IANA time zone (${releases}), public domain. See scripts/data/README.md
// for where each input comes from and why one of them is deliberately an old release.
import type { TzPlace } from '$lib/data/timezoneTable';

export const TZ_PLACES: Record<string, TzPlace> = {
${Object.entries(table.places).map(entry).join('\n')}
};

/** Renamed or deprecated ids browsers still report — every value is a key of TZ_PLACES. */
export const TZ_ALIAS: Record<string, string> = {
${Object.entries(table.aliases)
	.map(([alias, target]) => `\t'${alias}': '${target}',`)
	.join('\n')}
};
`;
}
