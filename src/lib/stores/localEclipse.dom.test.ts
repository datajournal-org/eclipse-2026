import { describe, it, expect, beforeEach, vi } from 'vitest';
import { get } from 'svelte/store';
import { localCircumstances } from '$lib/eclipse';
import { byName } from '$lib/testing/reference';

/** Fresh copies of both stores — localEclipse derives from the module-level userLocation. */
async function load() {
	vi.resetModules();
	localStorage.clear();
	window.history.replaceState({}, '', '/');
	const location = await import('./location');
	const { localEclipse } = await import('./localEclipse');
	return { ...location, localEclipse };
}

beforeEach(() => {
	localStorage.clear();
	window.history.replaceState({}, '', '/');
});

describe('localEclipse', () => {
	it('already describes the guessed place before anything is chosen', async () => {
		// There is no un-located state in a hydrated browser: location.ts falls back to a place guessed
		// from the time zone, so this store has something to compute from on the very first frame. The
		// suite runs under TZ=Europe/Berlin (package.json), which the table resolves to Berlin.
		const { localEclipse } = await load();
		const value = get(localEclipse);
		expect(value).not.toBeNull();
		expect(value!.obscuration).toBeCloseTo(localCircumstances(52.5, 13.37)!.obscuration, 2);
	});

	it('matches localCircumstances for the chosen place', async () => {
		const { setLocation, localEclipse } = await load();
		const site = byName('Oviedo');
		setLocation({ lat: site.lat, lon: site.lon, name: site.name });

		const value = get(localEclipse)!;
		const expected = localCircumstances(site.lat, site.lon)!;
		expect(value.kind).toBe(expected.kind);
		expect(value.obscuration).toBe(expected.obscuration);
		expect(value.peak!.time.getTime()).toBe(expected.peak!.time.getTime());
	});

	it('recomputes when the location changes', async () => {
		const { setLocation, localEclipse } = await load();
		const berlin = byName('Berlin');
		const munich = byName('München');

		setLocation({ lat: berlin.lat, lon: berlin.lon, name: berlin.name });
		const first = get(localEclipse)!.obscuration;
		setLocation({ lat: munich.lat, lon: munich.lon, name: munich.name });
		const second = get(localEclipse)!.obscuration;

		expect(second).not.toBe(first);
		expect(second).toBeCloseTo(munich.obsc, 2);
	});

	it('returns to the guessed place when the location is cleared', async () => {
		const { setLocation, clearLocation, localEclipse } = await load();
		setLocation({ lat: 43.3603, lon: -5.8448, name: 'Oviedo' }); // total
		expect(get(localEclipse)!.kind).toBe('total');
		clearLocation();
		// Not null — clearing drops back to the guess, so the page keeps showing a sky.
		expect(get(localEclipse)).not.toBeNull();
		expect(get(localEclipse)!.kind).toBe('partial'); // Berlin, from TZ=Europe/Berlin
	});

	it('computes once per location change, not once per subscriber', async () => {
		// The search is iterative and the value feeds three B-screens; recomputing per reader would be
		// visible as jank when the verdict, timeline and checklist all mount.
		const { setLocation, localEclipse } = await load();
		let computations = 0;
		const unsub = localEclipse.subscribe(() => computations++);
		const alsoSubscribed = localEclipse.subscribe(() => {});

		setLocation({ lat: 43.3603, lon: -5.8448, name: 'Oviedo' });
		expect(computations).toBe(2); // initial null + one recompute

		unsub();
		alsoSubscribed();
	});

	it('picks up a location restored from storage at load', async () => {
		vi.resetModules();
		localStorage.setItem('eclipse.location', JSON.stringify({ lat: 43.3603, lon: -5.8448, name: 'Oviedo' }));
		const { localEclipse } = await import('./localEclipse');
		expect(get(localEclipse)!.kind).toBe('total');
	});
});
