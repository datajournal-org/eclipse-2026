import { describe, it, expect } from 'vitest';
import { bridgeSegments, type Segment } from './overlay';

// Mirrors the constants in overlay.ts — the loupe is a 96 px square at stage (10, 10), the Sun marker
// a 26 px square centred on the tiny real Sun.
const LOUPE_C = [58, 58] as const;
const LOUPE_HALF = 48;
const MARKER_HALF = 13;

const onLoupeCorner = (x: number, y: number) =>
	Math.abs(Math.abs(x - LOUPE_C[0]) - LOUPE_HALF) < 1e-9 && Math.abs(Math.abs(y - LOUPE_C[1]) - LOUPE_HALF) < 1e-9;
const onMarkerCorner = (x: number, y: number, sx: number, sy: number) =>
	Math.abs(Math.abs(x - sx) - MARKER_HALF) < 1e-9 && Math.abs(Math.abs(y - sy) - MARKER_HALF) < 1e-9;

/** Do two segments cross? (proper intersection, shared endpoints excluded) */
const crosses = (a: Segment, b: Segment) => {
	const d = (px: number, py: number, qx: number, qy: number, rx: number, ry: number) =>
		(qx - px) * (ry - py) - (qy - py) * (rx - px);
	const d1 = d(a.x1, a.y1, a.x2, a.y2, b.x1, b.y1);
	const d2 = d(a.x1, a.y1, a.x2, a.y2, b.x2, b.y2);
	const d3 = d(b.x1, b.y1, b.x2, b.y2, a.x1, a.y1);
	const d4 = d(b.x1, b.y1, b.x2, b.y2, a.x2, a.y2);
	return d1 * d2 < 0 && d3 * d4 < 0;
};

describe('bridgeSegments', () => {
	it('returns nothing while the marker overlaps the loupe', () => {
		// No clean funnel to draw — the connectors would run backwards through the loupe.
		expect(bridgeSegments(58, 58)).toBeNull();
		expect(bridgeSegments(100, 58)).toBeNull();
		expect(bridgeSegments(58, 100)).toBeNull();
	});

	it('switches on exactly at the edge of the overlap box', () => {
		const boundary = LOUPE_C[0] + LOUPE_HALF + MARKER_HALF; // 119
		expect(bridgeSegments(boundary - 0.001, 58)).toBeNull();
		expect(bridgeSegments(boundary + 0.001, 58)).not.toBeNull();
	});

	it.each([
		['right', 400, 58],
		['below', 58, 400],
		['above', 58, -300],
		['left', -300, 58],
		['down-right', 400, 300],
		['up-right', 400, -200],
		['down-left', -250, 300],
		['up-left', -250, -200]
	])('returns two bridge edges with the marker %s', (_dir, sx, sy) => {
		const segs = bridgeSegments(sx, sy);
		expect(segs).not.toBeNull();
		expect(segs).toHaveLength(2);
		for (const s of segs!) {
			const startsAtLoupe = onLoupeCorner(s.x1, s.y1);
			// each edge must join one loupe corner to one marker corner, in either order
			if (startsAtLoupe) expect(onMarkerCorner(s.x2, s.y2, sx, sy)).toBe(true);
			else {
				expect(onMarkerCorner(s.x1, s.y1, sx, sy)).toBe(true);
				expect(onLoupeCorner(s.x2, s.y2)).toBe(true);
			}
		}
	});

	it('produces two distinct, non-crossing connectors', () => {
		// Crossed connectors are the classic convex-hull bug — they read as an X instead of a funnel.
		for (const [sx, sy] of [
			[400, 58],
			[58, 400],
			[400, 300],
			[-250, -200],
			[300, -180]
		]) {
			const [a, b] = bridgeSegments(sx, sy)!;
			expect(crosses(a, b), `${sx}/${sy}`).toBe(false);
			expect(a).not.toEqual(b);
		}
	});

	it('handles the axis-aligned cases, where collinear corners tempt the hull to drop an edge', () => {
		// Directly right / directly below puts two loupe corners and two marker corners on parallel
		// lines — the degenerate input for a monotone chain that discards collinear points.
		const right = bridgeSegments(400, 58)!;
		expect(right).toHaveLength(2);
		// the two connectors leave from the loupe's top-right and bottom-right corners
		const loupeYs = right.map((s) => (onLoupeCorner(s.x1, s.y1) ? s.y1 : s.y2)).sort((a, b) => a - b);
		expect(loupeYs).toEqual([10, 106]);

		const below = bridgeSegments(58, 400)!;
		expect(below).toHaveLength(2);
		const loupeXs = below.map((s) => (onLoupeCorner(s.x1, s.y1) ? s.x1 : s.x2)).sort((a, b) => a - b);
		expect(loupeXs).toEqual([10, 106]);
	});

	it('widens the funnel as the marker approaches', () => {
		// The near marker subtends a wider angle from the loupe than a distant one.
		const spread = (sx: number, sy: number) => {
			// Orient both edges loupe → marker first; the hull may hand them back in either direction,
			// and comparing raw atan2 values would then measure the winding, not the funnel.
			const dir = (s: Segment) => {
				const [fromX, fromY, toX, toY] = onLoupeCorner(s.x1, s.y1)
					? [s.x1, s.y1, s.x2, s.y2]
					: [s.x2, s.y2, s.x1, s.y1];
				const len = Math.hypot(toX - fromX, toY - fromY);
				return [(toX - fromX) / len, (toY - fromY) / len];
			};
			const [a, b] = bridgeSegments(sx, sy)!.map(dir);
			return Math.acos(Math.max(-1, Math.min(1, a[0] * b[0] + a[1] * b[1])));
		};
		expect(spread(150, 58)).toBeGreaterThan(spread(800, 58));
	});

	it('keeps every coordinate finite', () => {
		for (let sx = -400; sx <= 1200; sx += 137) {
			for (let sy = -400; sy <= 900; sy += 131) {
				const segs = bridgeSegments(sx, sy);
				if (!segs) continue;
				for (const s of segs) {
					for (const v of [s.x1, s.y1, s.x2, s.y2]) expect(Number.isFinite(v)).toBe(true);
				}
			}
		}
	});

	it('never returns a single dangling connector', () => {
		// The function is all-or-nothing: two edges or null. A lone leader line would look like a bug.
		for (let sx = -400; sx <= 1200; sx += 41) {
			for (let sy = -400; sy <= 900; sy += 37) {
				const segs = bridgeSegments(sx, sy);
				if (segs !== null) expect(segs, `${sx}/${sy}`).toHaveLength(2);
			}
		}
	});
});
