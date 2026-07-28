import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Map as MlMap } from 'maplibre-gl';
import { buildMapStyle, addSceneLayers, sunArcEnvelope } from './mapSetup';
import { emptyStarState } from './starLayer';
import { emptyVeilState } from './veilLayer';
import { SKY_PALETTE } from '$lib/config';
import { byName } from '$lib/testing/reference';
import { createFakeMap, type FakeMap } from '$lib/testing/fakes';
import { buildTimeline } from './timeline';
import { localCircumstances, sunMoonHorizon } from '$lib/eclipse';
import type { SunState } from './sunLayer';

/** A stand-in for @versatiles/style's `colorful`, shaped like the real thing. */
const fakeColorful = (opts: { baseUrl: string }) => ({
	version: 8 as const,
	name: 'colorful',
	baseUrl: opts.baseUrl,
	sources: {
		'versatiles-shortbread': { type: 'vector', url: `${opts.baseUrl}/tiles/osm` }
	} as Record<string, unknown>,
	layers: [
		{ id: 'background', type: 'background', paint: { 'background-color': '#f9f4ee' } },
		{ id: 'water', type: 'fill', paint: {} },
		{ id: 'building', type: 'fill', paint: {} },
		{ id: 'building:outline', type: 'line', paint: {} },
		{ id: 'label-city', type: 'symbol', layout: {} },
		{ id: 'label-street', type: 'symbol', layout: {} }
	] as { id: string; type: string; paint?: Record<string, unknown>; layout?: Record<string, unknown> }[]
});

type Colorful = Parameters<typeof buildMapStyle>[0];

describe('buildMapStyle', () => {
	it('strips every label layer', () => {
		// B3 is a horizon view — street labels floating in the sky would break the illusion.
		const { style } = buildMapStyle(fakeColorful as unknown as Colorful);
		expect(style.layers.some((l) => l.type === 'symbol')).toBe(false);
		expect(style.layers.map((l) => l.id)).toEqual(['background', 'water', 'building', 'building:outline']);
	});

	it('wires in the terrarium-encoded DEM source', () => {
		const { style } = buildMapStyle(fakeColorful as unknown as Colorful);
		expect(style.sources.dem).toEqual({
			type: 'raster-dem',
			tiles: ['https://tiles.versatiles.org/tiles/elevation/{z}/{x}/{y}'],
			tileSize: 512,
			maxzoom: 12,
			encoding: 'terrarium'
		});
	});

	it('caps the DEM at the zoom the source actually has', () => {
		// The elevation tiles stop at z12 (its tiles.json says so). Without the cap MapLibre requests
		// z13+ at B3's zoom 16 and every one of them 404s — which also stopped the map ever settling.
		const { style } = buildMapStyle(fakeColorful as unknown as Colorful);
		expect((style.sources.dem as { maxzoom: number }).maxzoom).toBe(12);
	});

	it('keeps the base tile source', () => {
		const { style } = buildMapStyle(fakeColorful as unknown as Colorful);
		expect(style.sources['versatiles-shortbread']).toBeDefined();
	});

	it('reports the land colour so the buildings can match the ground', () => {
		const { landColor } = buildMapStyle(fakeColorful as unknown as Colorful);
		expect(landColor).toBe('#f9f4ee');
	});

	it('falls back to a sane land colour if the style has no background', () => {
		const noBackground = (opts: { baseUrl: string }) => {
			const s = fakeColorful(opts);
			s.layers = s.layers.filter((l) => l.id !== 'background');
			return s;
		};
		expect(buildMapStyle(noBackground as unknown as Colorful).landColor).toBe('#f9f4ee');
	});

	it('requests tiles from the VersaTiles host', () => {
		const { style } = buildMapStyle(fakeColorful as unknown as Colorful);
		expect((style as unknown as { baseUrl: string }).baseUrl).toBe('https://tiles.versatiles.org');
	});
});

describe('addSceneLayers', () => {
	let m: FakeMap;
	const sun: SunState = { center: [0, 0, 0, 1], moon: [0, 0], moonR: 1, angRad: 0.0046, visible: true, screen: null };

	beforeEach(() => {
		m = createFakeMap();
		Object.assign(m, {
			setTerrain: vi.fn(),
			setCenterClampedToGround: vi.fn(),
			setSky: vi.fn(),
			getStyle: () => ({ layers: [{ id: 'label-city', type: 'symbol' }] })
		});
		// the two building layers the setup is meant to replace
		m.layers.push({ id: 'building' }, { id: 'building:outline' });
	});

	const add = () =>
		addSceneLayers(m as unknown as MlMap, {
			sun,
			stars: emptyStarState(),
			veil: emptyVeilState(),
			landColor: '#f9f4ee'
		});

	it('turns on terrain from the DEM source', () => {
		add();
		expect((m as unknown as { setTerrain: ReturnType<typeof vi.fn> }).setTerrain).toHaveBeenCalledWith({
			source: 'dem',
			exaggeration: 1.0
		});
	});

	it('unclamps the view centre from the ground', () => {
		// Documented fix for the camera bobbing as it orbits over mountains.
		add();
		expect(
			(m as unknown as { setCenterClampedToGround: ReturnType<typeof vi.fn> }).setCenterClampedToGround
		).toHaveBeenCalledWith(false);
	});

	it('sets the sky from the shared palette', () => {
		add();
		const [sky] = (m as unknown as { setSky: ReturnType<typeof vi.fn> }).setSky.mock.calls[0];
		expect(sky['sky-color']).toBe(SKY_PALETTE.sky);
		expect(sky['horizon-color']).toBe(SKY_PALETTE.horizon);
		expect(sky['fog-color']).toBe(SKY_PALETTE.fog);
	});

	it('carries on when the runtime rejects the sky spec', () => {
		// An older maplibre throws here; the dusk veil still dims the scene, so this must not be fatal.
		(m as unknown as { setSky: ReturnType<typeof vi.fn> }).setSky = vi.fn(() => {
			throw new Error('unsupported sky property');
		});
		expect(() => add()).not.toThrow();
		expect(m.callsTo('addLayer').length).toBeGreaterThan(0);
	});

	it('adds a hillshade anchored to the map', () => {
		// 'map' anchoring is what lets syncMapLighting steer the illumination with the Sun's azimuth.
		add();
		const hillshade = m.callsTo('addLayer').find((c) => (c.args[0] as { id: string }).id === 'hillshade')!;
		const layer = hillshade.args[0] as { type: string; source: string; paint: Record<string, unknown> };
		expect(layer.type).toBe('hillshade');
		expect(layer.source).toBe('dem');
		expect(layer.paint['hillshade-illumination-anchor']).toBe('map');
	});

	it('replaces the flat building layers with a 3D extrusion', () => {
		add();
		expect(m.callsTo('removeLayer').map((c) => c.args[0])).toEqual(['building', 'building:outline']);
		const buildings = m.callsTo('addLayer').find((c) => (c.args[0] as { id: string }).id === 'buildings-3d')!;
		const layer = buildings.args[0] as { type: string; paint: Record<string, unknown> };
		expect(layer.type).toBe('fill-extrusion');
		expect(layer.paint['fill-extrusion-color']).toBe('#f9f4ee');
	});

	it('inserts the scene below the first symbol layer', () => {
		add();
		for (const id of ['hillshade', 'buildings-3d']) {
			const call = m.callsTo('addLayer').find((c) => (c.args[0] as { id: string }).id === id)!;
			expect(call.args[1], id).toBe('label-city');
		}
	});

	it('adds the Sun billboard last, on top of everything', () => {
		add();
		const ids = m.callsTo('addLayer').map((c) => (c.args[0] as { id: string }).id);
		expect(ids).toContain('sun');
		expect(ids.at(-1)).toBe('sun');
	});

	it('does not try to remove building layers that are not in the style', () => {
		m.layers = [];
		add();
		expect(m.callsTo('removeLayer')).toHaveLength(0);
	});
});

describe('sunArcEnvelope', () => {
	const site = byName('Oviedo');
	const { times, N } = buildTimeline(site.lat, site.lon, localCircumstances(site.lat, site.lon));

	it('brackets every sampled Sun position', () => {
		const arc = sunArcEnvelope(site.lat, site.lon, times, N, 10);
		for (let i = 0; i <= N; i += 10) {
			const { az, alt } = sunMoonHorizon(site.lat, site.lon, new Date(times[i])).sun;
			// azimuth may be unwrapped, so compare modulo 360
			const wrapped = (((az - arc.azMin) % 360) + 360) % 360;
			expect(wrapped, `sample ${i}`).toBeLessThanOrEqual(arc.azMax - arc.azMin + 1e-9);
			expect(alt, `sample ${i}`).toBeLessThanOrEqual(arc.altMax + 1e-9);
		}
	});

	it('reports the true peak altitude', () => {
		const arc = sunArcEnvelope(site.lat, site.lon, times, N, 10);
		const sampled = [];
		for (let i = 0; i <= N; i += 10) sampled.push(sunMoonHorizon(site.lat, site.lon, new Date(times[i])).sun.alt);
		expect(arc.altMax).toBeCloseTo(Math.max(...sampled), 9);
	});

	it('produces a west-facing evening arc', () => {
		const arc = sunArcEnvelope(site.lat, site.lon, times, N, 10);
		expect(arc.azMin).toBeGreaterThan(230);
		expect(arc.azMax).toBeLessThan(310);
		expect(arc.azMax).toBeGreaterThan(arc.azMin);
	});

	it('unwraps the azimuth so an arc across due north stays contiguous', () => {
		// A naive min/max would return 0..360 for an arc straddling the seam, and the camera would try
		// to frame the entire horizon.
		const arctic = { lat: 78.2232, lon: 15.6469 }; // Longyearbyen — midnight Sun, azimuth crosses north
		const midnight = Array.from({ length: 25 }, (_, i) => Date.UTC(2026, 5, 21, 20) + i * 30 * 60_000);
		const arc = sunArcEnvelope(arctic.lat, arctic.lon, midnight, 24, 1);
		expect(arc.azMax - arc.azMin).toBeLessThan(300);
		expect(Number.isFinite(arc.azMin) && Number.isFinite(arc.azMax)).toBe(true);
	});

	it('honours the sampling step', () => {
		const coarse = sunArcEnvelope(site.lat, site.lon, times, N, 60);
		const fine = sunArcEnvelope(site.lat, site.lon, times, N, 5);
		// a finer sample can only widen the envelope
		expect(fine.azMin).toBeLessThanOrEqual(coarse.azMin);
		expect(fine.azMax).toBeGreaterThanOrEqual(coarse.azMax);
		expect(fine.altMax).toBeGreaterThanOrEqual(coarse.altMax);
	});

	it('handles a single sample without returning infinities', () => {
		const arc = sunArcEnvelope(site.lat, site.lon, times, 0, 1);
		expect(Number.isFinite(arc.azMin)).toBe(true);
		expect(arc.azMin).toBe(arc.azMax);
	});
});
