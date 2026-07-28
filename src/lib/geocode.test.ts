import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { searchPlaces, reverseGeocode } from './geocode';

/** A Photon GeoJSON feature. */
const feature = (properties: Record<string, unknown>, coordinates: [number, number] = [13.405, 52.52]) => ({
	geometry: { type: 'Point', coordinates },
	properties
});

/** Stub `fetch` with a JSON body; returns the spy so tests can inspect the request URL. */
const stubJson = (body: unknown, init: { ok?: boolean; status?: number } = {}) => {
	const spy = vi.fn(async (url: string) => {
		void url;
		return { ok: init.ok ?? true, status: init.status ?? 200, json: async () => body };
	});
	vi.stubGlobal('fetch', spy);
	return spy;
};

beforeEach(() => vi.unstubAllGlobals());
afterEach(() => vi.unstubAllGlobals());

describe('searchPlaces', () => {
	it('returns nothing for a query too short to be useful', async () => {
		const spy = stubJson({ features: [] });
		expect(await searchPlaces('')).toEqual([]);
		expect(await searchPlaces('a')).toEqual([]);
		expect(await searchPlaces('  b  ')).toEqual([]);
		// and crucially, does not hit the network for them
		expect(spy).not.toHaveBeenCalled();
	});

	it('carries a deadline on every request, even without a caller signal', async () => {
		// The one network failure the UI cannot convert into its own error state is a server that accepts
		// and stalls — the timeout signal turns that into a TimeoutError after REQUEST_TIMEOUT_MS.
		const spy = vi.fn(async (_url: string, init?: RequestInit) => {
			expect(init?.signal).toBeInstanceOf(AbortSignal);
			return { ok: true, status: 200, json: async () => ({ features: [] }) };
		});
		vi.stubGlobal('fetch', spy);
		await searchPlaces('Oviedo');
		await reverseGeocode(43.36, -5.84);
		expect(spy).toHaveBeenCalledTimes(2);
	});

	it('still honours the caller abort alongside the deadline', async () => {
		// AbortSignal.any: whichever fires first wins — a superseded search must still abort instantly.
		const controller = new AbortController();
		const spy = vi.fn(async (_url: string, init?: RequestInit) => {
			controller.abort();
			expect(init?.signal?.aborted).toBe(true);
			throw new DOMException('aborted', 'AbortError');
		});
		vi.stubGlobal('fetch', spy);
		await expect(searchPlaces('Oviedo', 'de', 6, controller.signal)).rejects.toThrow();
	});

	it('queries the VersaTiles Photon instance', async () => {
		const spy = stubJson({ features: [] });
		await searchPlaces('Oviedo');
		const url = new URL(spy.mock.calls[0][0]);
		expect(url.origin).toBe('https://geocode.versatiles.org');
		expect(url.pathname).toBe('/api');
		expect(url.searchParams.get('q')).toBe('Oviedo');
		expect(url.searchParams.get('limit')).toBe('6');
	});

	it('encodes the query rather than splicing it into the URL', async () => {
		const spy = stubJson({ features: [] });
		await searchPlaces('Sant Julià & Cia');
		const url = new URL(spy.mock.calls[0][0]);
		expect(url.searchParams.get('q')).toBe('Sant Julià & Cia');
	});

	it('trims the query', async () => {
		const spy = stubJson({ features: [] });
		await searchPlaces('  Palma  ');
		expect(new URL(spy.mock.calls[0][0]).searchParams.get('q')).toBe('Palma');
	});

	it('honours the limit', async () => {
		const spy = stubJson({ features: [] });
		await searchPlaces('Berlin', 'de', 12);
		expect(new URL(spy.mock.calls[0][0]).searchParams.get('limit')).toBe('12');
	});

	it.each([
		['de', 'de'],
		['fr', 'fr'],
		['it', 'it'],
		['en', 'en'],
		['es', 'en'], // Photon has no Spanish → English
		['ja', 'en']
	])('maps locale %s to Photon language %s', async (locale, expected) => {
		const spy = stubJson({ features: [] });
		await searchPlaces('Madrid', locale);
		expect(new URL(spy.mock.calls[0][0]).searchParams.get('lang')).toBe(expected);
	});

	it('flattens a full address into label and context', async () => {
		stubJson({
			features: [
				feature({
					name: 'Catedral de San Salvador',
					street: 'Plaza Alfonso II',
					housenumber: '1',
					city: 'Oviedo',
					state: 'Asturias',
					country: 'España'
				})
			]
		});
		expect(await searchPlaces('Catedral')).toEqual([
			{ lat: 52.52, lon: 13.405, label: 'Catedral de San Salvador', sub: 'Oviedo, Asturias, España' }
		]);
	});

	it('falls back through street, city, county and country for the label', async () => {
		stubJson({
			features: [
				feature({ street: 'Hauptstraße', housenumber: '7', city: 'Berlin' }),
				feature({ city: 'Palma', country: 'España' }),
				feature({ county: 'Asturias' }),
				feature({ country: 'Ísland' }),
				feature({})
			]
		});
		expect((await searchPlaces('query')).map((h) => h.label)).toEqual([
			'Hauptstraße 7',
			'Palma',
			'Asturias',
			'Ísland',
			'—'
		]);
	});

	it('never repeats the label in its own context line', async () => {
		stubJson({ features: [feature({ name: 'Berlin', city: 'Berlin', state: 'Berlin', country: 'Deutschland' })] });
		expect((await searchPlaces('Berlin'))[0]).toEqual({
			lat: 52.52,
			lon: 13.405,
			label: 'Berlin',
			sub: 'Deutschland'
		});
	});

	it('de-duplicates repeated context parts', async () => {
		stubJson({ features: [feature({ name: 'Museum', city: 'Hamburg', state: 'Hamburg', country: 'Deutschland' })] });
		expect((await searchPlaces('Museum'))[0].sub).toBe('Hamburg, Deutschland');
	});

	it('prefers state over county for the context', async () => {
		stubJson({ features: [feature({ name: 'Plaza', city: 'A', state: 'S', county: 'C', country: 'D' })] });
		expect((await searchPlaces('query'))[0].sub).toBe('A, S, D');
	});

	it('reads coordinates as [lon, lat], not [lat, lon]', async () => {
		// Photon speaks GeoJSON; getting this backwards would put every result in the wrong hemisphere.
		stubJson({ features: [feature({ name: 'Oviedo' }, [-5.8448, 43.3603])] });
		expect((await searchPlaces('Oviedo'))[0]).toMatchObject({ lat: 43.3603, lon: -5.8448 });
	});

	it('skips features with no usable geometry', async () => {
		stubJson({
			features: [{ geometry: {}, properties: { name: 'broken' } }, feature({ name: 'good' })]
		});
		expect((await searchPlaces('query')).map((h) => h.label)).toEqual(['good']);
	});

	it('tolerates a response with no features array', async () => {
		stubJson({});
		expect(await searchPlaces('nowhere')).toEqual([]);
	});

	it('tolerates a feature with no properties', async () => {
		stubJson({ features: [{ geometry: { coordinates: [1, 2] } }] });
		expect(await searchPlaces('query')).toEqual([{ lat: 2, lon: 1, label: '—', sub: '' }]);
	});

	it('ignores non-string property values instead of rendering them', async () => {
		stubJson({ features: [feature({ name: 42, city: 'Berlin' })] });
		expect((await searchPlaces('query'))[0].label).toBe('Berlin');
	});

	it('throws on an HTTP error so the dialog can show a failure', async () => {
		stubJson({}, { ok: false, status: 500 });
		await expect(searchPlaces('Berlin')).rejects.toThrow('geocode 500');
	});

	it('propagates a network failure', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => {
				throw new TypeError('Failed to fetch');
			})
		);
		await expect(searchPlaces('Berlin')).rejects.toThrow();
	});
});

describe('reverseGeocode', () => {
	it('queries the reverse endpoint with lon and lat', async () => {
		const spy = stubJson({ features: [feature({ name: 'Cudillero' })] });
		await reverseGeocode(43.5465, -6.5321);
		const url = new URL(spy.mock.calls[0][0]);
		expect(url.pathname).toBe('/reverse');
		expect(url.searchParams.get('lat')).toBe('43.5465');
		expect(url.searchParams.get('lon')).toBe('-6.5321');
	});

	it('joins the label and its context into one line', async () => {
		stubJson({ features: [feature({ name: 'Cudillero', city: 'Cudillero', state: 'Asturias', country: 'España' })] });
		expect(await reverseGeocode(43.5465, -6.5321)).toBe('Cudillero, Asturias, España');
	});

	it('returns just the label when there is no context', async () => {
		stubJson({ features: [feature({ name: 'Nowhere' })] });
		expect(await reverseGeocode(0, 0)).toBe('Nowhere');
	});

	it('uses the first feature only', async () => {
		stubJson({ features: [feature({ name: 'First' }), feature({ name: 'Second' })] });
		expect(await reverseGeocode(0, 0)).toBe('First');
	});

	it('honours the locale', async () => {
		const spy = stubJson({ features: [] });
		await reverseGeocode(0, 0, 'it');
		expect(new URL(spy.mock.calls[0][0]).searchParams.get('lang')).toBe('it');
	});

	it('returns null rather than throwing on an HTTP error', async () => {
		// A failed reverse lookup only costs a place name; the coordinate is still usable.
		stubJson({}, { ok: false, status: 500 });
		expect(await reverseGeocode(0, 0)).toBeNull();
	});

	it('returns null on a network failure', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => {
				throw new TypeError('Failed to fetch');
			})
		);
		expect(await reverseGeocode(0, 0)).toBeNull();
	});

	it('returns null on malformed JSON', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => ({
				ok: true,
				status: 200,
				json: async () => {
					throw new SyntaxError('unexpected token');
				}
			}))
		);
		expect(await reverseGeocode(0, 0)).toBeNull();
	});

	it('returns null when there is no result', async () => {
		stubJson({ features: [] });
		expect(await reverseGeocode(0, 0)).toBeNull();
	});
});
