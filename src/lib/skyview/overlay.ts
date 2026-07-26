// Loupe→marker connectors for the B3 sky view. The loupe (fixed, top-left) and the Sun-marker (glued to
// the tiny real Sun) are both squares; the two connectors are the convex-hull "bridge" edges between them
// — the polygon analogue of the external tangents between two circles. Pure geometry in stage pixels.

export type Segment = { x1: number; y1: number; x2: number; y2: number };

const LOUPE_C: [number, number] = [58, 58]; // loupe centre in stage px (top/left 10 + 48)
const LOUPE_HALF = 48; // loupe half-size (96 px / 2)
const MARKER_HALF = 13; // locator square half-size (26 px / 2)

type Pt = { x: number; y: number; g: number }; // g: 0 = loupe corner, 1 = marker corner

// Andrew's monotone-chain convex hull. Collinear points are dropped (cross <= 0).
const hull = (pts: Pt[]): Pt[] => {
	const sorted = pts.slice().sort((a, b) => a.x - b.x || a.y - b.y);
	const cross = (o: Pt, a: Pt, b: Pt) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
	const chain = (src: Pt[]) => {
		const out: Pt[] = [];
		for (const p of src) {
			while (out.length >= 2 && cross(out[out.length - 2], out[out.length - 1], p) <= 0) out.pop();
			out.push(p);
		}
		out.pop();
		return out;
	};
	return chain(sorted).concat(chain(sorted.slice().reverse()));
};

// The two hull edges that jump between the loupe square and the Sun-marker square centred at (sx, sy),
// or null when the two squares overlap (no clean funnel to draw).
export function bridgeSegments(sx: number, sy: number): [Segment, Segment] | null {
	const overlap =
		Math.abs(sx - LOUPE_C[0]) < LOUPE_HALF + MARKER_HALF && Math.abs(sy - LOUPE_C[1]) < LOUPE_HALF + MARKER_HALF;
	if (overlap) return null;

	const corners: Pt[] = [
		{ x: LOUPE_C[0] - LOUPE_HALF, y: LOUPE_C[1] - LOUPE_HALF, g: 0 },
		{ x: LOUPE_C[0] + LOUPE_HALF, y: LOUPE_C[1] - LOUPE_HALF, g: 0 },
		{ x: LOUPE_C[0] + LOUPE_HALF, y: LOUPE_C[1] + LOUPE_HALF, g: 0 },
		{ x: LOUPE_C[0] - LOUPE_HALF, y: LOUPE_C[1] + LOUPE_HALF, g: 0 },
		{ x: sx - MARKER_HALF, y: sy - MARKER_HALF, g: 1 },
		{ x: sx + MARKER_HALF, y: sy - MARKER_HALF, g: 1 },
		{ x: sx + MARKER_HALF, y: sy + MARKER_HALF, g: 1 },
		{ x: sx - MARKER_HALF, y: sy + MARKER_HALF, g: 1 }
	];
	const hp = hull(corners);
	const segs: Segment[] = [];
	for (let i = 0; i < hp.length && segs.length < 2; i++) {
		const a = hp[i],
			b = hp[(i + 1) % hp.length];
		if (a.g !== b.g) segs.push({ x1: a.x, y1: a.y, x2: b.x, y2: b.y });
	}
	return segs.length === 2 ? [segs[0], segs[1]] : null;
}
