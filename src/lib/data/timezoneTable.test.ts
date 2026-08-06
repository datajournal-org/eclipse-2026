import { describe, it, expect } from 'vitest';
import { parseCoordinates, cityName, parseZoneTab, parseBackward, buildTimezoneTable } from './timezoneTable';
import { TZ_PLACES, TZ_ALIAS } from './timezones.generated';

describe('parseCoordinates', () => {
	it('reads the ±DDMM±DDDMM form', () => {
		expect(parseCoordinates('+4024-00341')).toEqual({ lat: 40.4, lon: -3.68 }); // Madrid
	});

	it('reads the ±DDMMSS±DDDMMSS form', () => {
		expect(parseCoordinates('+394000-0752400')).toEqual({ lat: 39.67, lon: -75.4 });
	});

	it('applies a negative sign to the whole angle, not just the degrees', () => {
		// The trap: Number('-00') is -0, so "-0019" naively becomes +0.317° — the wrong hemisphere for
		// every place within a degree of the equator or the prime meridian.
		expect(parseCoordinates('-0019+03025')).toEqual({ lat: -0.32, lon: 30.42 });
		expect(parseCoordinates('+5133-00042')).toEqual({ lat: 51.55, lon: -0.7 });
	});

	it('rejects anything that is not a coordinate', () => {
		for (const s of ['', 'Europe/Berlin', '+40', '4024-00341', '+40240-0341']) {
			expect(parseCoordinates(s), s).toBeNull();
		}
	});
});

describe('cityName', () => {
	it('takes the last segment and unescapes the underscores', () => {
		expect(cityName('Europe/Berlin')).toBe('Berlin');
		expect(cityName('America/Argentina/Buenos_Aires')).toBe('Buenos Aires');
		expect(cityName('America/Port-au-Prince')).toBe('Port-au-Prince');
	});
});

describe('parseZoneTab', () => {
	it('skips comments and short lines, keeps the rest in file order', () => {
		const rows = parseZoneTab(
			[
				'# a comment',
				'',
				'ES\t+4024-00341\tEurope/Madrid',
				'XX\tnonsense\tBad/Zone',
				'DE\t+5230+01322\tEurope/Berlin'
			].join('\n')
		);
		expect(rows.map((r) => r.zone)).toEqual(['Europe/Madrid', 'Europe/Berlin']);
	});
});

describe('parseBackward', () => {
	it('reads Link lines as alias → target, ignoring trailing comments', () => {
		expect(
			parseBackward(['# header', 'Link\tAsia/Kolkata\t\tAsia/Calcutta', 'Zone\tSomething\tElse'].join('\n'))
		).toEqual([{ alias: 'Asia/Calcutta', target: 'Asia/Kolkata' }]);
	});
});

describe('buildTimezoneTable', () => {
	const PRIMARY = ['DE\t+5230+01322\tEurope/Berlin', 'UA\t+5026+03031\tEurope/Kyiv'].join('\n');
	// The frozen snapshot: it still carries Oslo (a MERGE — a different city) and Kyiv's old id
	// (a RENAME — the same point).
	const SUPPLEMENT = ['NO\t+5955+01045\tEurope/Oslo', 'UA\t+5026+03031\tEurope/Kiev'].join('\n');
	const BACKWARD = ['Link\tEurope/Berlin\t\tEurope/Oslo', 'Link\tEurope/Kyiv\t\tEurope/Kiev'].join('\n');

	const table = buildTimezoneTable(PRIMARY, SUPPLEMENT, BACKWARD);

	it('keeps a merged zone’s own coordinates rather than its link target’s', () => {
		expect(table.places['Europe/Oslo']).toEqual([59.92, 10.75, 'Oslo']);
		expect(table.aliases['Europe/Oslo']).toBeUndefined();
	});

	it('turns a rename into an alias, so the current name wins', () => {
		// Same point on both ends of the link ⇒ same city ⇒ the old id gives up its entry.
		expect(table.places['Europe/Kiev']).toBeUndefined();
		expect(table.aliases['Europe/Kiev']).toBe('Europe/Kyiv');
		expect(table.places['Europe/Kyiv']).toEqual([50.43, 30.52, 'Kyiv']);
	});

	it('lets the current release win where both files carry a zone', () => {
		const t = buildTimezoneTable('DE\t+0000+00000\tEurope/Berlin', 'DE\t+5230+01322\tEurope/Berlin', '');
		expect(t.places['Europe/Berlin']).toEqual([0, 0, 'Berlin']);
	});
});

/**
 * The generated artifact itself. These are the checks that fail when the vendored tabs go stale or a
 * refresh half-parses — the failure mode being guarded against is silent: a wrong table does not crash,
 * it just quietly sends more and more readers to the showcase place.
 */
describe('timezones.generated', () => {
	it('covers every zone this JavaScript engine knows about', () => {
		const missing = Intl.supportedValuesOf('timeZone').filter((z) => !(z in TZ_PLACES) && !(z in TZ_ALIAS));
		expect(missing, `zones newer than the vendored tzdata: ${missing.join(', ')}`).toEqual([]);
	});

	it('holds a plausible number of zones', () => {
		// A half-read tab file still produces a valid-looking module; only a floor catches it.
		expect(Object.keys(TZ_PLACES).length).toBeGreaterThan(350);
		expect(Object.keys(TZ_PLACES).length).toBeLessThan(800);
	});

	it('has no alias pointing at a missing zone', () => {
		for (const [alias, target] of Object.entries(TZ_ALIAS)) {
			expect(TZ_PLACES[target], `${alias} → ${target}`).toBeDefined();
		}
	});

	it('has no zone that is both a place and an alias', () => {
		expect(Object.keys(TZ_ALIAS).filter((z) => z in TZ_PLACES)).toEqual([]);
	});

	it('holds coordinates in range, with a name', () => {
		for (const [zone, [lat, lon, city]] of Object.entries(TZ_PLACES)) {
			expect(Number.isFinite(lat) && Number.isFinite(lon), zone).toBe(true);
			expect(Math.abs(lat), zone).toBeLessThanOrEqual(90);
			expect(Math.abs(lon), zone).toBeLessThanOrEqual(180);
			expect(city.length, zone).toBeGreaterThan(0);
			expect(city, zone).not.toContain('_');
		}
	});
});
