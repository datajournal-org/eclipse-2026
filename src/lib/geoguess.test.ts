import { describe, it, expect } from 'vitest';
import { guessPlace, SHOWCASE } from '$lib/geoguess';
import { TZ_PLACES } from '$lib/data/timezones.generated';
import { localCircumstances, eclipseVisible } from '$lib/eclipse';

/** The table's own row for a zone, as a Place minus its provenance. */
const place = (zone: string) => {
	const [lat, lon, name] = TZ_PLACES[zone];
	return { lat, lon, name };
};

/**
 * The guess replaced the app's "no location chosen" state, so its contract is total: EVERY input, valid
 * or not, has to produce a place the app can open on. The tests below are the failure ladder from
 * geoguess.ts, one rung each.
 */
describe('guessPlace', () => {
	it('resolves a zone inside the eclipse to its own city', () => {
		expect(guessPlace('Europe/Madrid')).toEqual({ lat: 40.4, lon: -3.68, name: 'Madrid', source: 'guess' });
		expect(guessPlace('Europe/Berlin')).toMatchObject({ name: 'Berlin', source: 'guess' });
	});

	it('keeps zones the 2022 database merged away pointed at their own cities', () => {
		// The whole reason scripts/data/ carries a frozen 2022a zone.tab. Since 2022b these are Link lines
		// to Berlin and Brussels, and resolving them that way would open a Swedish reader's app on a sky
		// 750 km from theirs — at Stockholm's latitude the eclipse is visibly deeper.
		expect(guessPlace('Europe/Stockholm')).toMatchObject({ name: 'Stockholm' });
		expect(guessPlace('Europe/Oslo')).toMatchObject({ name: 'Oslo' });
		expect(guessPlace('Europe/Amsterdam')).toMatchObject({ name: 'Amsterdam' });
		expect(guessPlace('Europe/Stockholm').lat).toBeGreaterThan(58);
		expect(guessPlace('Europe/Amsterdam').lon).toBeLessThan(6);
	});

	it('follows the aliases engines still report', () => {
		// ECMA-402 no longer requires resolvedOptions().timeZone to be canonicalised, so this is the
		// difference between working everywhere and working on Chrome. Deliberately checked with zones
		// that CAN see the eclipse: for one that cannot, the showcase fallback would mask a broken alias
		// lookup and the test would pass for the wrong reason.
		expect(guessPlace('Eire')).toEqual({ ...place('Europe/Dublin'), source: 'guess' });
		expect(guessPlace('Atlantic/Faeroe')).toMatchObject({ name: 'Faroe', source: 'guess' });
		expect(guessPlace('America/Godthab')).toMatchObject({ name: 'Nuuk', source: 'guess' });
	});

	it.each([
		['a zone the eclipse never reaches', 'Australia/Sydney'],
		['another hemisphere entirely', 'Asia/Tokyo'],
		['South America', 'America/Sao_Paulo'],
		['a zone id that does not exist', 'Mars/Olympus_Mons'],
		// `'toString' in TZ_PLACES` is true — the tables are object literals, so `in` walks the prototype,
		// and destructuring the function it returns would throw at module load and take the page with it.
		['an Object.prototype key', 'toString'],
		['another one', 'constructor'],
		['a fixed-offset pseudo-zone', 'Etc/GMT+5'],
		['plain UTC', 'UTC'],
		['an empty string', ''],
		['no zone at all', null]
	])('falls back to the showcase for %s', (_case, zone) => {
		expect(guessPlace(zone)).toEqual(SHOWCASE);
	});

	it('never returns a place the app cannot draw a sky for', () => {
		// B3 only renders where eclipseVisible() is true, so a guess that fails this would land the reader
		// on a bare "not visible from here" card — the worst possible first screen.
		for (const zone of ['Europe/Madrid', 'Europe/Stockholm', 'Asia/Tokyo', 'UTC', null]) {
			const p = guessPlace(zone);
			expect(eclipseVisible(localCircumstances(p.lat, p.lon)), zone ?? 'null').toBe(true);
		}
	});
});

describe('SHOWCASE', () => {
	it('is a total eclipse, so the fallback shows what the app is actually about', () => {
		// Guards the trap the OG card's Madrid point fell into: 99.96 % obscuration is a PARTIAL, and a
		// showcase for a total-eclipse app should not be one.
		const lc = localCircumstances(SHOWCASE.lat, SHOWCASE.lon)!;
		expect(lc.kind).toBe('total');
		expect(eclipseVisible(lc)).toBe(true);
		expect(lc.peak!.alt).toBeGreaterThan(0);
	});

	it('declares itself a showcase, so the UI can say so', () => {
		expect(SHOWCASE.source).toBe('showcase');
		expect(SHOWCASE.name).toBeTruthy();
	});
});
