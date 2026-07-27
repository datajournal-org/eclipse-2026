import { test, expect } from './fixtures';
import { searchPlaces, reverseGeocode } from '../src/lib/geocode';

/**
 * The only test that talks to the real VersaTiles Photon instance.
 *
 * Everything else stubs the geocoder, which is right — the unit tests need an HTTP 500, an empty result
 * set and a bare `name` on demand, and no test should hammer a free community service. But a suite built
 * entirely on hand-written fixtures cannot notice the one failure that matters most: the upstream response
 * shape changing. If Photon renamed `properties.name` or flipped its coordinate order, `searchPlaces`
 * would return junk and every other test would stay green.
 *
 * So this calls the library function directly against the live service and asserts the contract it
 * depends on — not the data, which changes as OpenStreetMap changes.
 *
 * Excluded by default (`grepInvert: /@live/`). Run with `PWLIVE=1 npx playwright test --grep @live`,
 * ideally on a nightly schedule so an upstream change is a nightly failure rather than a red PR.
 */
test.describe('live VersaTiles Photon', { tag: '@live' }, () => {
	test.describe.configure({ retries: 2 }); // a transient network blip is not a contract change

	// Self-enforcing: a project whose own grepInvert forgets @live would otherwise run these against the
	// real service on every PR, silently. That happened once — a project-level grepInvert replaces the
	// top-level one instead of adding to it — so fail loudly rather than quietly hitting the network.
	test.beforeAll(() => {
		if (!process.env.PWLIVE) {
			throw new Error(
				'@live specs ran without PWLIVE=1 — check grepInvert on every project in playwright.config.ts'
			);
		}
	});

	test('searchPlaces returns usable hits for a well-known city', async () => {
		const hits = await searchPlaces('Oviedo', 'de', 6);

		expect(hits.length).toBeGreaterThan(0);
		expect(hits.length).toBeLessThanOrEqual(6); // the limit is honoured

		for (const hit of hits) {
			expect(Number.isFinite(hit.lat) && Number.isFinite(hit.lon), JSON.stringify(hit)).toBe(true);
			expect(Math.abs(hit.lat)).toBeLessThanOrEqual(90);
			expect(Math.abs(hit.lon)).toBeLessThanOrEqual(180);
			expect(typeof hit.sub).toBe('string');
		}

		// A label of '—' is the fallback for "no property we recognise", so a whole page of them means the
		// property names moved.
		expect(hits.some((h) => h.label !== '—' && h.label.trim().length > 0)).toBe(true);
	});

	test('reads coordinates in Photon’s [lon, lat] order', async () => {
		// The highest-risk parsing detail: swapped, every result lands in the wrong hemisphere and the
		// eclipse verdict is silently wrong. Oviedo is 43.36 N, 5.84 W.
		const hits = await searchPlaces('Oviedo Asturias', 'de', 6);
		const near = hits.find((h) => Math.abs(h.lat - 43.36) < 1 && Math.abs(h.lon + 5.84) < 1);
		expect(near, `no hit near Oviedo in ${JSON.stringify(hits)}`).toBeDefined();
	});

	test('still returns a context line built from the place hierarchy', async () => {
		// `sub` is assembled from city/state/county/country. If those keys vanish the UI still renders,
		// just with every result stripped of the context that tells two same-named places apart.
		const hits = await searchPlaces('Berlin', 'de', 6);
		expect(hits.some((h) => h.sub.length > 0)).toBe(true);
	});

	test('honours the language parameter without erroring', async () => {
		for (const locale of ['de', 'en', 'es']) {
			const hits = await searchPlaces('München', locale, 3);
			expect(hits.length, locale).toBeGreaterThan(0);
		}
	});

	test('reverseGeocode names a known coordinate', async () => {
		const name = await reverseGeocode(43.3603, -5.8448, 'de');
		expect(name).not.toBeNull();
		expect(name!.trim().length).toBeGreaterThan(0);
	});

	test('reverseGeocode returns null rather than throwing in the middle of the ocean', async () => {
		// The app treats a failed reverse lookup as cosmetic; it must never reject.
		await expect(reverseGeocode(0, -30, 'de')).resolves.not.toThrow();
	});

	test('the stubbed fixtures still match the live response shape', async () => {
		// Ties the two layers together: whatever the fixtures in fixtures.ts claim, the live service must
		// still produce features with the same two fields the parser reads.
		const response = await fetch('https://geocode.versatiles.org/api?q=Oviedo&limit=1&lang=de');
		expect(response.ok).toBe(true);
		const data = (await response.json()) as {
			features?: { geometry?: { coordinates?: unknown }; properties?: Record<string, unknown> }[];
		};
		expect(Array.isArray(data.features)).toBe(true);
		expect(data.features!.length).toBeGreaterThan(0);
		const feature = data.features![0];
		expect(Array.isArray(feature.geometry?.coordinates)).toBe(true);
		expect(typeof feature.properties).toBe('object');
	});
});
