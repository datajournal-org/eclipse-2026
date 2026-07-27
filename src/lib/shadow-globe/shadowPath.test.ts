import { describe, it, expect } from 'vitest';
import { shadowFrames, shadowPathLine, timelineStart, timelineEnd, formatUtc } from './shadowPath';
import { TIMELINE_START, TIMELINE_END, FRAME_STEP_MS } from '$lib/config';
import { shadowCenter } from '$lib/eclipse';

describe('shadowFrames', () => {
	it('covers the configured window at the configured step', () => {
		expect(shadowFrames).toHaveLength(241);
		expect(shadowFrames[0].time).toBe(TIMELINE_START.getTime());
		expect(shadowFrames[shadowFrames.length - 1].time).toBe(TIMELINE_END.getTime());
	});

	it('steps evenly and strictly forward', () => {
		for (let i = 1; i < shadowFrames.length; i++) {
			expect(shadowFrames[i].time - shadowFrames[i - 1].time).toBe(FRAME_STEP_MS);
		}
	});

	it('exposes its own endpoints', () => {
		expect(timelineStart).toBe(shadowFrames[0].time);
		expect(timelineEnd).toBe(shadowFrames[shadowFrames.length - 1].time);
	});
});

describe('shadowPathLine', () => {
	const coords = shadowPathLine.geometry.coordinates;

	it('is a GeoJSON LineString feature', () => {
		expect(shadowPathLine.type).toBe('Feature');
		expect(shadowPathLine.geometry.type).toBe('LineString');
	});

	it('keeps only the frames where the umbra actually reaches Earth', () => {
		const landed = shadowFrames.filter((f) => shadowCenter(new Date(f.time)) !== null);
		expect(coords).toHaveLength(landed.length);
		expect(coords.length).toBeLessThan(shadowFrames.length); // the window deliberately overhangs
		expect(coords.length).toBeGreaterThan(100);
	});

	it('matches shadowCenter frame for frame', () => {
		const landed = shadowFrames.map((f) => shadowCenter(new Date(f.time))).filter((c) => c !== null);
		coords.forEach(([lon, lat], i) => {
			expect(lon).toBeCloseTo(landed[i]!.lon, 9);
			expect(lat).toBeCloseTo(landed[i]!.lat, 9);
		});
	});

	it('holds only valid coordinates', () => {
		for (const [lon, lat] of coords) {
			expect(Number.isFinite(lon) && Number.isFinite(lat)).toBe(true);
			expect(lon).toBeGreaterThanOrEqual(-180);
			expect(lon).toBeLessThan(180);
			expect(Math.abs(lat)).toBeLessThanOrEqual(90);
		}
	});

	it('runs from the Arctic down to Spain', () => {
		expect(coords[0][1]).toBeGreaterThan(70);
		expect(coords[coords.length - 1][1]).toBeLessThan(45);
		expect(coords[coords.length - 1][1]).toBeGreaterThan(35);
	});

	it('is a contiguous run — the umbra never lands, leaves and lands again', () => {
		// If it did, a plain LineString would draw a straight line across the gap.
		const landedFlags = shadowFrames.map((f) => shadowCenter(new Date(f.time)) !== null);
		const first = landedFlags.indexOf(true);
		const last = landedFlags.lastIndexOf(true);
		expect(landedFlags.slice(first, last + 1).every(Boolean)).toBe(true);
	});
});

describe('formatUtc', () => {
	it('renders UTC hours and minutes', () => {
		expect(formatUtc(Date.UTC(2026, 7, 12, 17, 45))).toBe('17:45');
		expect(formatUtc(Date.UTC(2026, 7, 12, 9, 5))).toBe('09:05');
		expect(formatUtc(Date.UTC(2026, 7, 12, 0, 0))).toBe('00:00');
	});

	it('ignores seconds rather than rounding them', () => {
		expect(formatUtc(Date.UTC(2026, 7, 12, 17, 45, 59))).toBe('17:45');
	});

	it('stays in UTC regardless of the host timezone', () => {
		// The A2 globe is a world view; its labels are deliberately not localised.
		expect(formatUtc(Date.parse('2026-08-12T17:45:00Z'))).toBe('17:45');
	});
});
