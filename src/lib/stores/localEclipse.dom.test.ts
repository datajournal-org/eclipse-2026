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
	it('is null while no location is set', async () => {
		const { localEclipse } = await load();
		expect(get(localEclipse)).toBeNull();
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

	it('returns to null when the location is cleared', async () => {
		const { setLocation, clearLocation, localEclipse } = await load();
		setLocation({ lat: 52.52, lon: 13.405, name: 'Berlin' });
		expect(get(localEclipse)).not.toBeNull();
		clearLocation();
		expect(get(localEclipse)).toBeNull();
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
