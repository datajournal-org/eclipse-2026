import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { get } from 'svelte/store';

const KEY = 'eclipse.location';

/**
 * The store reads the URL and localStorage at MODULE LOAD (deliberately — see the comment in
 * location.ts about the post-hydration layout jump), so every case needs a fresh module registry and a
 * fresh document location.
 */
async function loadWith({ search = '', stored }: { search?: string; stored?: string | null } = {}) {
	vi.resetModules();
	window.history.replaceState({}, '', `/${search}`);
	localStorage.clear();
	if (stored != null) localStorage.setItem(KEY, stored);
	return await import('./location');
}

beforeEach(() => {
	localStorage.clear();
	window.history.replaceState({}, '', '/');
});

describe('initial value', () => {
	it('is null with neither a URL override nor stored data', async () => {
		const { userLocation } = await loadWith();
		expect(get(userLocation)).toBeNull();
	});

	it('reads the ?lat&lon debug override', async () => {
		const { userLocation } = await loadWith({ search: '?lat=43.5465&lon=-6.5321&name=Cudillero' });
		expect(get(userLocation)).toEqual({ lat: 43.5465, lon: -6.5321, name: 'Cudillero' });
	});

	it('leaves the name null when the URL omits it', async () => {
		const { userLocation } = await loadWith({ search: '?lat=52.52&lon=13.405' });
		expect(get(userLocation)).toEqual({ lat: 52.52, lon: 13.405, name: null });
	});

	it('accepts negative and zero coordinates', async () => {
		const { userLocation } = await loadWith({ search: '?lat=0&lon=0' });
		expect(get(userLocation)).toEqual({ lat: 0, lon: 0, name: null });
	});

	it('restores from localStorage', async () => {
		const { userLocation } = await loadWith({
			stored: JSON.stringify({ lat: 48.1372, lon: 11.5756, name: 'München' })
		});
		expect(get(userLocation)).toEqual({ lat: 48.1372, lon: 11.5756, name: 'München' });
	});

	it('prefers the URL override over stored data', async () => {
		const { userLocation } = await loadWith({
			search: '?lat=1&lon=2',
			stored: JSON.stringify({ lat: 48.1372, lon: 11.5756, name: 'München' })
		});
		expect(get(userLocation)).toEqual({ lat: 1, lon: 2, name: null });
	});

	it.each([
		['a non-numeric lat', '?lat=abc&lon=13.4'],
		['a missing lon', '?lat=52.52'],
		['an empty lat', '?lat=&lon=13.4'],
		['no coordinates at all', '?name=Berlin']
	])('falls through to storage when the URL has %s', async (_case, search) => {
		const stored = JSON.stringify({ lat: 48.1372, lon: 11.5756, name: 'München' });
		const { userLocation } = await loadWith({ search, stored });
		expect(get(userLocation)).toEqual({ lat: 48.1372, lon: 11.5756, name: 'München' });
	});

	it.each([
		['corrupt JSON', 'not json at all'],
		['an empty object', '{}'],
		['a null lat', '{"lat":null,"lon":13.4}'],
		['a string lat', '{"lat":"52.52","lon":13.4}'],
		['JSON null', 'null']
	])('ignores %s in storage instead of throwing', async (_case, stored) => {
		const { userLocation } = await loadWith({ stored });
		expect(get(userLocation)).toBeNull();
	});

	it('defaults a stored place with no name', async () => {
		const { userLocation } = await loadWith({ stored: '{"lat":52.52,"lon":13.405}' });
		expect(get(userLocation)).toEqual({ lat: 52.52, lon: 13.405, name: null });
	});
});

describe('setLocation', () => {
	it('updates the store and persists', async () => {
		const { userLocation, setLocation } = await loadWith();
		setLocation({ lat: 43.3603, lon: -5.8448, name: 'Oviedo' });
		expect(get(userLocation)).toEqual({ lat: 43.3603, lon: -5.8448, name: 'Oviedo' });
		expect(JSON.parse(localStorage.getItem(KEY)!)).toEqual({ lat: 43.3603, lon: -5.8448, name: 'Oviedo' });
	});

	it('replaces the previous place rather than merging into it', async () => {
		// A merge would carry the old name across to the new coordinates — a place called "Oviedo" sitting
		// at Berlin's position, which reads as correct everywhere except on the map.
		const { setLocation } = await loadWith();
		setLocation({ lat: 43.3603, lon: -5.8448, name: 'Oviedo' });
		setLocation({ lat: 52.52, lon: 13.405, name: null });
		expect(JSON.parse(localStorage.getItem(KEY)!)).toEqual({ lat: 52.52, lon: 13.405, name: null });
	});

	it('coerces numeric strings that slipped in from an input field', async () => {
		const { userLocation, setLocation } = await loadWith();
		setLocation({ lat: '43.36' as unknown as number, lon: '-5.84' as unknown as number, name: null });
		expect(get(userLocation)).toEqual({ lat: 43.36, lon: -5.84, name: null });
	});

	it('normalises a missing name to null', async () => {
		const { userLocation, setLocation } = await loadWith();
		setLocation({ lat: 1, lon: 2 } as { lat: number; lon: number; name: null });
		expect(get(userLocation)!.name).toBeNull();
	});

	it('notifies subscribers', async () => {
		const { userLocation, setLocation } = await loadWith();
		const seen: unknown[] = [];
		const unsub = userLocation.subscribe((v) => seen.push(v));
		setLocation({ lat: 1, lon: 2, name: 'x' });
		unsub();
		expect(seen).toHaveLength(2);
		expect(seen[1]).toEqual({ lat: 1, lon: 2, name: 'x' });
	});
});

describe('clearLocation', () => {
	it('empties the store and the stored value', async () => {
		const { userLocation, clearLocation } = await loadWith({ stored: '{"lat":52.52,"lon":13.405,"name":"Berlin"}' });
		expect(get(userLocation)).not.toBeNull();
		clearLocation();
		expect(get(userLocation)).toBeNull();
		expect(localStorage.getItem(KEY)).toBeNull();
	});
});

describe('privacy contract', () => {
	// The file header promises the location is never written to the URL, so a shared link cannot leak
	// the user's address. This is the test that keeps that promise honest.
	afterEach(() => vi.restoreAllMocks());

	it('never writes the location into the URL', async () => {
		const { setLocation, clearLocation } = await loadWith();
		// Spy only after the load — loadWith itself uses replaceState to position the test URL.
		const push = vi.spyOn(window.history, 'pushState');
		const replace = vi.spyOn(window.history, 'replaceState');

		setLocation({ lat: 43.3603, lon: -5.8448, name: 'Oviedo' });
		clearLocation();
		setLocation({ lat: 52.52, lon: 13.405, name: 'Berlin' });

		expect(push).not.toHaveBeenCalled();
		expect(replace).not.toHaveBeenCalled();
		expect(window.location.search).toBe('');
		expect(window.location.href).not.toContain('43.36');
	});

	it('does not write back a location that came in via the URL', async () => {
		// The write-back would happen during module load, so position the URL first and only then start
		// watching — otherwise loadWith's own replaceState is what the spy sees.
		vi.resetModules();
		localStorage.clear();
		window.history.replaceState({}, '', '/?lat=43.3603&lon=-5.8448');
		const push = vi.spyOn(window.history, 'pushState');
		const replace = vi.spyOn(window.history, 'replaceState');

		const { userLocation } = await import('./location');
		expect(get(userLocation)).toEqual({ lat: 43.3603, lon: -5.8448, name: null });
		expect(push).not.toHaveBeenCalled();
		expect(replace).not.toHaveBeenCalled();
		expect(window.location.search).toBe('?lat=43.3603&lon=-5.8448'); // left as-is, not rewritten
	});

	it('does not persist a URL override to storage on load', async () => {
		// Reading the URL is a debug affordance; it must not silently become the stored location.
		await loadWith({ search: '?lat=43.3603&lon=-5.8448' });
		expect(localStorage.getItem(KEY)).toBeNull();
	});
});

describe('hostile storage', () => {
	afterEach(() => vi.restoreAllMocks());

	it('survives a localStorage that throws on read (Safari private mode)', async () => {
		vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
			throw new DOMException('denied');
		});
		const { userLocation } = await loadWith();
		expect(get(userLocation)).toBeNull();
	});

	it('survives a localStorage that throws on write (quota exceeded)', async () => {
		const { userLocation, setLocation } = await loadWith();
		vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
			throw new DOMException('QuotaExceededError');
		});
		expect(() => setLocation({ lat: 1, lon: 2, name: null })).not.toThrow();
		// the in-memory store still updates, so the UI works for this session
		expect(get(userLocation)).toEqual({ lat: 1, lon: 2, name: null });
	});
});
