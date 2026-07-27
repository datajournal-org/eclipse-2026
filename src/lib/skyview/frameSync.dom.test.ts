import { describe, it, expect } from 'vitest';
import type { Map as MlMap } from 'maplibre-gl';
import { placeSun, syncMapLighting } from './frameSync';
import { eclipseGeometry } from './eclipseGeometry';
import { localCircumstances, sunset } from '$lib/eclipse';
import { byName } from '$lib/testing/reference';
import { createFakeMap, fakeMaplibregl } from '$lib/testing/fakes';
import type { SunState } from './sunLayer';
import { DEG_TO_RAD } from '$lib/constants';

const emptySun = (): SunState => ({
	center: [0, 0, 0, 1],
	angRad: 0,
	moon: [0, 0],
	moonR: 1,
	visible: false
});

const OVIEDO = byName('Oviedo');
const peakOf = (site: { lat: number; lon: number }) => localCircumstances(site.lat, site.lon)!.peak!.time;

const place = (site: { lat: number; lon: number }, when: Date, terrainElevation: number | null = 0) => {
	const sun = emptySun();
	const m = createFakeMap({ terrainElevation });
	placeSun(sun, eclipseGeometry(site.lat, site.lon, when), {
		maplibregl: fakeMaplibregl,
		m: m as unknown as MlMap,
		lat: site.lat,
		lon: site.lon
	});
	return { sun, m };
};

describe('placeSun', () => {
	it('expresses the Moon offset in Sun-radius units', () => {
		// The shader draws the crescent by subtracting a unit-radius disc, so these are ratios, not degrees.
		const when = peakOf(OVIEDO);
		const geo = eclipseGeometry(OVIEDO.lat, OVIEDO.lon, when);
		const { sun } = place(OVIEDO, when);
		expect(sun.moon[0]).toBeCloseTo(geo.dx / geo.sunAngR, 12);
		expect(sun.moon[1]).toBeCloseTo(geo.dy / geo.sunAngR, 12);
		expect(sun.moonR).toBeCloseTo(geo.moonAngR / geo.sunAngR, 12);
	});

	it('gives the Moon a radius slightly over 1 during a total eclipse', () => {
		const { sun } = place(OVIEDO, peakOf(OVIEDO));
		expect(sun.moonR).toBeGreaterThan(1);
		expect(sun.moonR).toBeLessThan(1.08);
	});

	it('sets the Sun angular radius in radians, not degrees', () => {
		const when = peakOf(OVIEDO);
		const geo = eclipseGeometry(OVIEDO.lat, OVIEDO.lon, when);
		const { sun } = place(OVIEDO, when);
		expect(sun.angRad).toBeCloseTo(geo.sunAngR * DEG_TO_RAD, 12);
		expect(sun.angRad).toBeCloseTo(0.00459, 4); // ~0.26° in radians
	});

	it('places the Sun as a finite Mercator position', () => {
		const { sun } = place(OVIEDO, peakOf(OVIEDO));
		expect(sun.center).toHaveLength(4);
		expect(sun.center.every(Number.isFinite)).toBe(true);
		expect(sun.center[3]).toBe(1);
		// x is a normalised Mercator coordinate, so it stays inside the unit square near Spain
		expect(sun.center[0]).toBeGreaterThan(0);
		expect(sun.center[0]).toBeLessThan(1);
	});

	it('tracks the setting Sun westward and downward', () => {
		const peak = peakOf(OVIEDO);
		const early = place(OVIEDO, new Date(peak.getTime() - 30 * 60_000)).sun;
		const late = place(OVIEDO, new Date(peak.getTime() + 30 * 60_000)).sun;
		expect(late.center[0]).toBeLessThan(early.center[0]); // Mercator x decreases going west
		expect(late.center[2]).toBeLessThan(early.center[2]); // and the altitude term drops
	});

	it('reads the ground elevation at the observer', () => {
		const { m } = place(OVIEDO, peakOf(OVIEDO));
		expect(m.callsTo('queryTerrainElevation')).toHaveLength(1);
		expect(m.callsTo('queryTerrainElevation')[0].args[0]).toEqual([OVIEDO.lon, OVIEDO.lat]);
	});

	it('treats missing terrain as sea level rather than NaN', () => {
		// queryTerrainElevation returns null before the DEM tile has loaded — a very common first frame.
		const { sun } = place(OVIEDO, peakOf(OVIEDO), null);
		expect(sun.center.every(Number.isFinite)).toBe(true);
	});

	it('lifts the Sun with the terrain', () => {
		const low = place(OVIEDO, peakOf(OVIEDO), 0).sun;
		const high = place(OVIEDO, peakOf(OVIEDO), 2000).sun;
		expect(high.center[2]).toBeGreaterThan(low.center[2]);
	});

	it('keeps the Sun visible until the whole disc has set', () => {
		// The documented rule: `visible` flips at altitude = -(angular radius), i.e. when the upper limb
		// drops below the horizon — matching the sunset time shown on the slider, rather than vanishing
		// ~2 min early as the centre crosses.
		const site = byName('Palma');
		const set = sunset(site.lat, site.lon)!;
		expect(place(site, new Date(set.getTime() - 60_000)).sun.visible).toBe(true);
		expect(place(site, new Date(set.getTime() + 120_000)).sun.visible).toBe(false);
	});

	it('flips visibility exactly at minus the angular radius', () => {
		const site = byName('Palma');
		// Walk minute by minute and find the flip, then check the geometry there.
		const set = sunset(site.lat, site.lon)!.getTime();
		let lastVisible = set - 10 * 60_000;
		let firstHidden = set + 10 * 60_000;
		for (let t = set - 10 * 60_000; t <= set + 10 * 60_000; t += 10_000) {
			if (place(site, new Date(t)).sun.visible) lastVisible = t;
			else {
				firstHidden = t;
				break;
			}
		}
		const geo = eclipseGeometry(site.lat, site.lon, new Date(lastVisible));
		expect(geo.sun.alt).toBeGreaterThan(-geo.sunAngR);
		const hidden = eclipseGeometry(site.lat, site.lon, new Date(firstHidden));
		expect(hidden.sun.alt).toBeLessThanOrEqual(-hidden.sunAngR);
	});

	it('is visible in broad daylight', () => {
		expect(place(byName('Reykjavík'), peakOf(byName('Reykjavík'))).sun.visible).toBe(true);
	});

	it('mutates the state object in place rather than replacing it', () => {
		// The custom layer holds a reference to this object and reads it every frame.
		const sun = emptySun();
		const before = sun;
		placeSun(sun, eclipseGeometry(OVIEDO.lat, OVIEDO.lon, peakOf(OVIEDO)), {
			maplibregl: fakeMaplibregl,
			m: createFakeMap() as unknown as MlMap,
			lat: OVIEDO.lat,
			lon: OVIEDO.lon
		});
		expect(sun).toBe(before);
		expect(sun.angRad).toBeGreaterThan(0);
	});
});

describe('syncMapLighting', () => {
	const env = { light: '#fff2dc', intensity: 0.25 };

	it('anchors the light to the map and encodes azimuth and altitude', () => {
		const m = createFakeMap();
		syncMapLighting(m as unknown as MlMap, 290.1, 3.5, env);
		const [options] = m.lastCall('setLight')!.args as [Record<string, unknown>];
		expect(options.anchor).toBe('map');
		expect(options.color).toBe('#fff2dc');
		expect(options.intensity).toBe(0.25);
		expect(options.position).toEqual([1.15, 290.1, 90 - 3.5]);
	});

	it('turns altitude into a polar angle', () => {
		// MapLibre wants the angle from vertical: a Sun overhead is 0, a Sun on the horizon is 90.
		const m = createFakeMap();
		syncMapLighting(m as unknown as MlMap, 180, 90, env);
		expect((m.lastCall('setLight')!.args[0] as { position: number[] }).position[2]).toBe(0);
		syncMapLighting(m as unknown as MlMap, 180, 0, env);
		expect((m.lastCall('setLight')!.args[0] as { position: number[] }).position[2]).toBe(90);
	});

	it('steers the hillshade with a whole-degree azimuth', () => {
		const m = createFakeMap();
		syncMapLighting(m as unknown as MlMap, 290.6, 3.5, env);
		expect(m.lastCall('setPaintProperty')!.args).toEqual(['hillshade', 'hillshade-illumination-direction', 291]);
	});

	it.each([
		[-70, 290],
		[370, 10],
		[0, 0],
		[359.6, 0], // rounds to 360 → wrapped back to 0
		[720, 0]
	])('normalises a %d° azimuth to %d for the hillshade', (input, expected) => {
		const m = createFakeMap();
		syncMapLighting(m as unknown as MlMap, input, 10, env);
		const direction = m.lastCall('setPaintProperty')!.args[2] as number;
		expect(direction).toBe(expected);
		expect(direction).toBeGreaterThanOrEqual(0);
		expect(direction).toBeLessThan(360);
	});

	it('passes a Sun below the horizon through unclamped', () => {
		// After sunset the light angle exceeds 90; the veil, not the light, is what darkens the scene.
		const m = createFakeMap();
		syncMapLighting(m as unknown as MlMap, 300, -5, env);
		expect((m.lastCall('setLight')!.args[0] as { position: number[] }).position[2]).toBe(95);
	});
});
