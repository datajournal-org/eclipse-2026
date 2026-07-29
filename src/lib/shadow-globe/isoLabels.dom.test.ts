import { describe, it, expect, beforeEach } from 'vitest';
import type { Map as MlMap, Marker } from 'maplibre-gl';
import { IsoLabels } from './isoLabels';
import { computeShadowModel } from './shadowProfile';
import { sunMoonECEF } from '$lib/eclipse';
import { GREATEST } from '$lib/testing/reference';
import { createFakeMap, type FakeMap } from '$lib/testing/fakes';

const RINGS = [
	{ percent: 20, level: 0.2, opacity: 0.1, ogOpacity: 0.35 },
	{ percent: 60, level: 0.6, opacity: 0.3, ogOpacity: 0.6 },
	{ percent: 100, level: 0.999, opacity: 0.5, ogOpacity: 1 }
];

const model = computeShadowModel(sunMoonECEF(new Date(GREATEST.utc)));
/** A moment when the umbra has not reached the Earth, so there is nothing to label. */
const missing = computeShadowModel(sunMoonECEF(new Date('2026-08-12T15:30:00Z')));

/** A stand-in for maplibre's Marker, recording position and DOM element. */
class FakeMarker {
	element: HTMLElement;
	lngLat: [number, number] | null = null;
	added: unknown = null;
	removed = false;
	static instances: FakeMarker[] = [];

	constructor(public options: { element: HTMLElement; anchor?: string; offset?: [number, number] }) {
		this.element = options.element;
		FakeMarker.instances.push(this);
	}
	setLngLat(v: [number, number]) {
		this.lngLat = v;
		return this;
	}
	addTo(map: unknown) {
		this.added = map;
		return this;
	}
	getElement() {
		return this.element;
	}
	remove() {
		this.removed = true;
		return this;
	}
}

const MarkerCtor = FakeMarker as unknown as typeof Marker;

let map: FakeMap;

beforeEach(() => {
	FakeMarker.instances = [];
	map = createFakeMap();
	map.zoom = 4; // comfortably past the zoom fade
});

const attached = () => {
	const labels = new IsoLabels(RINGS);
	labels.attach(map as unknown as MlMap, MarkerCtor, [-25, 65]);
	return labels;
};

describe('attach', () => {
	it('creates one marker per ring and adds them to the map', () => {
		attached();
		expect(FakeMarker.instances).toHaveLength(3);
		for (const marker of FakeMarker.instances) expect(marker.added).toBe(map);
	});

	it('labels each marker with its percentage', () => {
		attached();
		expect(FakeMarker.instances.map((m) => m.element.textContent)).toEqual(['20 %', '60 %', '100 %']);
	});

	it('keeps the labels upright and viewport-aligned', () => {
		// Anchoring to the viewport is what stops the text from tipping over with the globe.
		attached();
		for (const marker of FakeMarker.instances) {
			expect(marker.options).toMatchObject({
				anchor: 'top',
				rotationAlignment: 'viewport',
				pitchAlignment: 'viewport'
			});
		}
	});

	it('starts hidden, before the first update has positioned anything', () => {
		attached();
		for (const marker of FakeMarker.instances) expect(marker.element.style.display).toBe('none');
	});

	it('gives every marker the styling hook', () => {
		attached();
		for (const marker of FakeMarker.instances) expect(marker.element.className).toBe('iso-label');
	});
});

describe('update', () => {
	it('positions and shows every label', () => {
		const labels = attached();
		labels.update(map as unknown as MlMap, model, true);
		for (const marker of FakeMarker.instances) {
			expect(marker.element.style.display).toBe('');
			expect(marker.lngLat).not.toBeNull();
			expect(marker.lngLat!.every(Number.isFinite)).toBe(true);
		}
	});

	it('stacks the rings outward from the umbra', () => {
		// Each label sits on its own ring along the same viewport-down ray, so they come out ordered.
		const labels = attached();
		labels.update(map as unknown as MlMap, model, true);
		const lats = FakeMarker.instances.map((m) => m.lngLat![1]);
		expect(lats[0]).not.toBe(lats[1]);
		expect(lats[1]).not.toBe(lats[2]);
	});

	it('fades each label to its ring opacity', () => {
		const labels = attached();
		labels.update(map as unknown as MlMap, model, true);
		const opacities = FakeMarker.instances.map((m) => Number(m.element.querySelector('span')!.style.opacity));
		expect(opacities[0]).toBeLessThan(opacities[1]);
		expect(opacities[1]).toBeLessThan(opacities[2]);
		expect(opacities[2]).toBeCloseTo(0.5, 6); // full zoom fade × the 100 % ring's opacity
	});

	it('boosts everything in screenshot mode (?og): no fade, full size, each ring’s ogOpacity', () => {
		// The OG card is captured at the wide opening zoom, exactly where the fade would ghost the
		// labels — scripts/build-og-image.ts relies on this override.
		const labels = attached();
		labels.screenshotMode = true;
		map.getZoom = () => 0; // far out: the fade would be 0 and hide the labels entirely
		labels.update(map as unknown as MlMap, model, true);
		const opacities = FakeMarker.instances.map((m) => Number(m.element.querySelector('span')!.style.opacity));
		expect(opacities[0]).toBeCloseTo(0.35, 6); // the 20 % ring's hardcoded card opacity
		expect(opacities[2]).toBeCloseTo(1, 6); // the 100 % ring at full strength
		for (const m of FakeMarker.instances) expect(m.element.style.fontSize).toBe('12px'); // no size ramp
	});

	it('hides everything when the overlay is switched off', () => {
		const labels = attached();
		labels.update(map as unknown as MlMap, model, true);
		labels.update(map as unknown as MlMap, model, false);
		for (const marker of FakeMarker.instances) expect(marker.element.style.display).toBe('none');
	});

	it('hides everything when there is no shadow model', () => {
		const labels = attached();
		labels.update(map as unknown as MlMap, model, true);
		labels.update(map as unknown as MlMap, null, true);
		for (const marker of FakeMarker.instances) expect(marker.element.style.display).toBe('none');
	});

	it('hides everything when the umbra misses the Earth', () => {
		const labels = attached();
		labels.update(map as unknown as MlMap, missing, true);
		for (const marker of FakeMarker.instances) expect(marker.element.style.display).toBe('none');
	});

	it('shrinks the labels as the globe zooms out', () => {
		const labels = attached();
		map.zoom = 4;
		labels.update(map as unknown as MlMap, model, true);
		const big = FakeMarker.instances[0].element.style.fontSize;

		map.zoom = 1.2;
		labels.update(map as unknown as MlMap, model, true);
		const small = FakeMarker.instances[0].element.style.fontSize;

		expect(parseFloat(small)).toBeLessThan(parseFloat(big));
	});

	it('hides the labels entirely once they would be unreadable', () => {
		// Below the fade threshold they are clutter, not information.
		const labels = attached();
		map.zoom = 0.5;
		labels.update(map as unknown as MlMap, model, true);
		for (const marker of FakeMarker.instances) expect(marker.element.style.display).toBe('none');
	});

	it('caps the font size when zoomed right in', () => {
		const labels = attached();
		map.zoom = 12;
		labels.update(map as unknown as MlMap, model, true);
		expect(parseFloat(FakeMarker.instances[0].element.style.fontSize)).toBeLessThanOrEqual(12);
	});

	it('does nothing before attach', () => {
		const labels = new IsoLabels(RINGS);
		expect(() => labels.update(map as unknown as MlMap, model, true)).not.toThrow();
	});

	it('re-reads the map on every call, so labels follow a pan', () => {
		const labels = attached();
		labels.update(map as unknown as MlMap, model, true);
		const before = map.callsTo('project').length + map.callsTo('unproject').length;
		labels.update(map as unknown as MlMap, model, true);
		expect(map.callsTo('project').length + map.callsTo('unproject').length).toBeGreaterThan(before);
	});
});

describe('destroy', () => {
	it('removes every marker', () => {
		const labels = attached();
		labels.destroy();
		for (const marker of FakeMarker.instances) expect(marker.removed).toBe(true);
	});

	it('is idempotent and safe before attach', () => {
		const labels = attached();
		labels.destroy();
		expect(() => labels.destroy()).not.toThrow();
		expect(() => new IsoLabels(RINGS).destroy()).not.toThrow();
	});

	it('leaves a destroyed instance inert', () => {
		const labels = attached();
		labels.destroy();
		const removed = FakeMarker.instances.map((m) => ({ ...m }));
		labels.update(map as unknown as MlMap, model, true);
		expect(FakeMarker.instances.map((m) => m.lngLat)).toEqual(removed.map((m) => m.lngLat));
	});
});

describe('viewport-down direction', () => {
	it('derives "down" from the umbra point and a point 40 px below it', () => {
		// Asking the map, rather than assuming south, is what keeps the labels stacked down the SCREEN
		// however the globe is rotated.
		const labels = attached();
		map.reset();
		labels.update(map as unknown as MlMap, model, true);

		const projected = map.callsTo('project');
		const unprojected = map.callsTo('unproject');
		expect(projected).toHaveLength(1);
		expect(unprojected).toHaveLength(1);
		const [screen] = projected[0].args as [[number, number]];
		const [below] = unprojected[0].args as [[number, number]];
		expect(below[0]).toBe(screen[0] * 10);
		expect(below[1]).toBe(-screen[1] * 10 + 40);
	});
});
