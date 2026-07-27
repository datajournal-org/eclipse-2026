import { describe, it, expect } from 'vitest';
import { lngLatToMercator, linePrimitiveFromSegments, fillStripPrimitive } from './isoLinesLayer';

const RED: [number, number, number] = [1, 0, 0];

describe('lngLatToMercator', () => {
	it('maps the origin to the centre of the [0,1] square', () => {
		expect(lngLatToMercator(0, 0)).toEqual([0.5, 0.5]);
	});

	it('maps the longitude range linearly onto x', () => {
		expect(lngLatToMercator(-180, 0)[0]).toBe(0);
		expect(lngLatToMercator(180, 0)[0]).toBe(1);
		expect(lngLatToMercator(90, 0)[0]).toBe(0.75);
	});

	it('maps the Mercator limit to the edges of y', () => {
		expect(lngLatToMercator(0, 85.0511287798066)[1]).toBeCloseTo(0, 6);
		expect(lngLatToMercator(0, -85.0511287798066)[1]).toBeCloseTo(1, 6);
	});

	it('lets y leave [0,1] beyond the Mercator limit instead of clamping the latitude', () => {
		// Deliberate: projectTile's inverse puts the vertex at the right latitude on the globe, so
		// clamping here would flatten the corridor against the 85° line instead of crossing the pole.
		expect(lngLatToMercator(0, 89)[1]).toBeLessThan(0);
		expect(lngLatToMercator(0, -89)[1]).toBeGreaterThan(1);
	});

	it('keeps the poles finite', () => {
		// tan(π/4 + lat/2) diverges at ±90°, hence the ±89.9999 guard.
		for (const lat of [90, -90, 90.5, -1000]) {
			const [x, y] = lngLatToMercator(0, lat);
			expect(Number.isFinite(x) && Number.isFinite(y), `${lat}`).toBe(true);
		}
	});

	it('is symmetric about the equator', () => {
		for (const lat of [10, 45, 80]) {
			expect(lngLatToMercator(0, lat)[1] + lngLatToMercator(0, -lat)[1]).toBeCloseTo(1, 12);
		}
	});

	it('is monotonic: north is up, east is right', () => {
		expect(lngLatToMercator(0, 40)[1]).toBeLessThan(lngLatToMercator(0, 30)[1]);
		expect(lngLatToMercator(20, 0)[0]).toBeGreaterThan(lngLatToMercator(10, 0)[0]);
	});

	it('accepts unwrapped longitudes past ±180', () => {
		// isoRing emits these on purpose so lines cross the antimeridian in one piece.
		expect(lngLatToMercator(190, 0)[0]).toBeCloseTo(1 + 10 / 360, 12);
		expect(lngLatToMercator(-190, 0)[0]).toBeCloseTo(-10 / 360, 12);
	});
});

describe('linePrimitiveFromSegments', () => {
	it('interleaves x,y into one buffer and indexes each segment', () => {
		const prim = linePrimitiveFromSegments(
			[
				[
					[0, 0],
					[90, 0]
				],
				[
					[-90, 0],
					[0, 45],
					[90, 0]
				]
			],
			RED,
			0.5
		);
		expect(prim.positions).toBeInstanceOf(Float32Array);
		expect(prim.positions).toHaveLength(2 * (2 + 3));
		expect(prim.segments).toEqual([
			{ first: 0, count: 2 },
			{ first: 2, count: 3 }
		]);
		expect(prim.color).toEqual(RED);
		expect(prim.opacity).toBe(0.5);
	});

	it('defaults to line mode', () => {
		const prim = linePrimitiveFromSegments([[[0, 0], [1, 1]]], RED, 1);
		expect(prim.mode).toBeUndefined();
	});

	it('projects each vertex', () => {
		const prim = linePrimitiveFromSegments([[[0, 0], [90, 0]]], RED, 1);
		expect([...prim.positions]).toEqual([0.5, 0.5, 0.75, 0.5]);
	});

	it('drops degenerate segments that cannot be drawn', () => {
		// A one-vertex LINE_STRIP renders nothing but would still consume a draw call and shift the
		// `first` offsets of everything after it.
		const prim = linePrimitiveFromSegments(
			[[[0, 0]], [[0, 0], [10, 10]], []],
			RED,
			1
		);
		expect(prim.segments).toEqual([{ first: 0, count: 2 }]);
		expect(prim.positions).toHaveLength(4);
	});

	it('keeps segment offsets contiguous after dropping one', () => {
		const prim = linePrimitiveFromSegments(
			[
				[[0, 0], [10, 0]],
				[[20, 0]],
				[[30, 0], [40, 0], [50, 0]]
			],
			RED,
			1
		);
		expect(prim.segments).toEqual([
			{ first: 0, count: 2 },
			{ first: 2, count: 3 }
		]);
		// every `first + count` stays inside the buffer
		for (const s of prim.segments) expect((s.first + s.count) * 2).toBeLessThanOrEqual(prim.positions.length);
	});

	it('returns an empty primitive for empty input', () => {
		const prim = linePrimitiveFromSegments([], RED, 1);
		expect(prim.positions).toHaveLength(0);
		expect(prim.segments).toEqual([]);
	});
});

describe('fillStripPrimitive', () => {
	const edgeA = [
		[0, 10],
		[10, 10],
		[20, 10]
	];
	const edgeB = [
		[0, 0],
		[10, 0],
		[20, 0]
	];

	it('emits A,B,A,B… as one triangle strip', () => {
		const prim = fillStripPrimitive(edgeA, edgeB, RED, 0.3);
		expect(prim.mode).toBe('fill');
		expect(prim.positions).toHaveLength(2 * 2 * 3);
		expect(prim.segments).toEqual([{ first: 0, count: 6 }]);
		// Float32Array rounds the doubles coming out of the projection, so compare with a tolerance.
		const [ax, ay] = lngLatToMercator(0, 10);
		const [bx, by] = lngLatToMercator(0, 0);
		for (const [i, expected] of [ax, ay, bx, by].entries()) expect(prim.positions[i]).toBeCloseTo(expected, 6);
	});

	it('truncates to the shorter edge rather than reading past the end', () => {
		const prim = fillStripPrimitive(edgeA, edgeB.slice(0, 2), RED, 1);
		expect(prim.positions).toHaveLength(2 * 2 * 2);
		expect(prim.segments).toEqual([{ first: 0, count: 4 }]);
		expect([...prim.positions].every(Number.isFinite)).toBe(true);
	});

	it('returns an empty strip for empty edges', () => {
		const prim = fillStripPrimitive([], [], RED, 1);
		expect(prim.positions).toHaveLength(0);
		expect(prim.segments).toEqual([{ first: 0, count: 0 }]);
	});

	it('carries colour and opacity through', () => {
		const prim = fillStripPrimitive(edgeA, edgeB, [0.2, 0.4, 0.6], 0.15);
		expect(prim.color).toEqual([0.2, 0.4, 0.6]);
		expect(prim.opacity).toBe(0.15);
	});

	it('handles the corridor’s real shape without NaN', () => {
		// The corridor crosses the pole, so its edges carry latitudes past the Mercator limit.
		const polar = [
			[100, 80],
			[120, 89],
			[-60, 89],
			[-25, 65]
		];
		const other = [
			[105, 79],
			[125, 88],
			[-55, 88],
			[-24, 64]
		];
		const prim = fillStripPrimitive(polar, other, RED, 1);
		expect([...prim.positions].every(Number.isFinite)).toBe(true);
	});
});
