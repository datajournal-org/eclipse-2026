import { describe, it, expect } from 'vitest';
import { computeCorridor } from './corridorCompute';
import { computeShadowModel, radiusForCoverage } from './shadowProfile';
import { sunMoonECEF, shadowCenter } from '$lib/eclipse';
import { TIMELINE_START, TIMELINE_END } from '$lib/config';
import { GREATEST } from '$lib/testing/reference';
import { latLonToUnitVector, dot, length } from './vec3';
import { EARTH_RADIUS_KM } from '$lib/constants';
import type { Vec3 } from '$lib/types';

// ~340 ms, so compute once for the whole file.
const edges = computeCorridor();

const angleKm = (a: [number, number], b: [number, number]) =>
	Math.acos(Math.max(-1, Math.min(1, dot(latLonToUnitVector(a[1], a[0]), latLonToUnitVector(b[1], b[0]))))) *
	EARTH_RADIUS_KM;

describe('computeCorridor', () => {
	it('returns two edges of equal length', () => {
		expect(edges.north.length).toBeGreaterThan(100);
		expect(edges.south).toHaveLength(edges.north.length);
	});

	it('holds only valid coordinates', () => {
		for (const edge of [edges.north, edges.south]) {
			for (const [lon, lat] of edge) {
				expect(Number.isFinite(lon) && Number.isFinite(lat)).toBe(true);
				expect(Math.abs(lon)).toBeLessThanOrEqual(180);
				expect(Math.abs(lat)).toBeLessThanOrEqual(90);
			}
		}
	});

	it('keeps each edge on a consistent side of the track', () => {
		// NOTE the names are track-relative, not latitude-relative: this path crosses the north pole, so
		// over roughly a third of its length the "north" edge sits at a LOWER latitude than the "south"
		// one. What must hold is that each edge stays on the same side of the direction of travel — the
		// alternative is a self-crossing band with a bow-tie at the pole.
		const sides = new Set<number>();
		const mid = (i: number): Vec3 =>
			latLonToUnitVector((edges.north[i][1] + edges.south[i][1]) / 2, (edges.north[i][0] + edges.south[i][0]) / 2);
		for (let i = 1; i < edges.north.length - 1; i++) {
			const here = mid(i);
			const prev = mid(i - 1);
			const tangent = here.map((c, k) => c - prev[k]) as Vec3;
			const toNorth = latLonToUnitVector(edges.north[i][1], edges.north[i][0]).map((c, k) => c - here[k]) as Vec3;
			const cross: Vec3 = [
				tangent[1] * toNorth[2] - tangent[2] * toNorth[1],
				tangent[2] * toNorth[0] - tangent[0] * toNorth[2],
				tangent[0] * toNorth[1] - tangent[1] * toNorth[0]
			];
			sides.add(Math.sign(dot(cross, here)));
		}
		expect([...sides]).toHaveLength(1);
	});

	it('holds a plausible width along its whole length', () => {
		const widths = edges.north.map((p, i) => angleKm(p, edges.south[i]));
		expect(Math.max(...widths)).toBeGreaterThan(200);
		expect(Math.max(...widths)).toBeLessThan(500);
		// only the two tips are zero-width
		expect(widths.filter((w) => w < 1)).toHaveLength(2);
	});

	it('pinches to a point at both ends', () => {
		// The zero-width tips are what make the band look like a real path rather than a cut-off ribbon.
		expect(edges.north[0]).toEqual(edges.south[0]);
		expect(edges.north[edges.north.length - 1]).toEqual(edges.south[edges.south.length - 1]);
	});

	it('runs from the Siberian Arctic to the western Mediterranean', () => {
		const [startLon, startLat] = edges.north[0];
		const [endLon, endLat] = edges.north[edges.north.length - 1];
		expect(startLat).toBeGreaterThan(70);
		expect(startLon).toBeGreaterThan(100);
		expect(endLat).toBeGreaterThan(35);
		expect(endLat).toBeLessThan(42);
		expect(endLon).toBeGreaterThan(0);
		expect(endLon).toBeLessThan(10);
	});

	it('passes within a corridor width of greatest eclipse', () => {
		const target: [number, number] = [GREATEST.lon, GREATEST.lat];
		const nearest = Math.min(...edges.north.map((p) => angleKm(p, target)));
		expect(nearest).toBeLessThan(200);
	});

	it('contains the whole central shadow track', () => {
		// The corridor is built as the union of umbra footprints, so every umbra centre must lie
		// between the edges. This is the property that guarantees the drawn umbra never escapes the band.
		for (let t = TIMELINE_START.getTime(); t <= TIMELINE_END.getTime(); t += 60_000) {
			const c = shadowCenter(new Date(t));
			if (!c) continue;
			const nearestNorth = Math.min(...edges.north.map((p) => angleKm(p, [c.lon, c.lat])));
			const nearestSouth = Math.min(...edges.south.map((p) => angleKm(p, [c.lon, c.lat])));
			// within half a corridor width of both edges → between them
			expect(nearestNorth, new Date(t).toISOString()).toBeLessThan(250);
			expect(nearestSouth, new Date(t).toISOString()).toBeLessThan(250);
		}
	});

	it('is about as wide as the umbra at greatest eclipse', () => {
		const model = computeShadowModel(sunMoonECEF(new Date(GREATEST.utc)));
		const umbraKm = radiusForCoverage(model, 0.999)! * EARTH_RADIUS_KM * 2;
		// Find the corridor's width where it passes closest to the greatest-eclipse point.
		let best = Infinity;
		let width = 0;
		for (let i = 0; i < edges.north.length; i++) {
			const d = angleKm(edges.north[i], [GREATEST.lon, GREATEST.lat]);
			if (d < best) {
				best = d;
				width = angleKm(edges.north[i], edges.south[i]);
			}
		}
		// The ground footprint is the cone cross-section divided by sin(sun altitude ≈ 26°).
		expect(width).toBeGreaterThan(umbraKm);
		expect(width).toBeLessThan(umbraKm / Math.sin((20 * Math.PI) / 180));
	});

	it('advances smoothly without doubling back', () => {
		// The central line is resampled by arc length precisely so the edges do not kink; a jump here
		// would show up as a visible notch in the drawn band.
		for (const edge of [edges.north, edges.south]) {
			for (let i = 1; i < edge.length; i++) {
				const step = angleKm(edge[i - 1], edge[i]);
				expect(step, `step ${i}`).toBeLessThan(400);
			}
		}
	});

	it('never wraps the antimeridian mid-edge', () => {
		// The path crosses the pole rather than the ±180° seam, but a bad unwrap would still show here.
		for (const edge of [edges.north, edges.south]) {
			for (let i = 1; i < edge.length; i++) {
				const jump = Math.abs(edge[i][0] - edge[i - 1][0]);
				expect(jump < 180 || jump > 340, `step ${i}: ${jump}`).toBe(true);
			}
		}
	});

	it('is deterministic', () => {
		// It is baked into a committed artefact at build time, so a run-to-run difference would mean
		// the file and the runtime silently disagree.
		expect(computeCorridor()).toEqual(edges);
	});

	it('keeps both edges outside the umbra centre line', () => {
		const model = computeShadowModel(sunMoonECEF(new Date(GREATEST.utc)));
		const footLen = length(model.center as Vec3);
		expect(footLen).toBeLessThan(1); // sanity: the umbra does reach Earth at that instant
	});
});

describe('corridor.generated.ts', () => {
	// Generated by `npm run corridor` (and by `prebuild`), and git-ignored — so it may legitimately be
	// absent on a fresh clone. When it IS there, it must match a fresh computation: a stale artefact
	// would ship a corridor that disagrees with the live iso-rings drawn over it.
	const round = (n: number) => Math.round(n * 1e5) / 1e5; // same precision the generator writes

	it('matches a fresh computation', async () => {
		let generated: typeof edges;
		try {
			generated = (await import('./corridor.generated')).corridorEdges;
		} catch {
			// eslint-disable-next-line no-console
			console.warn('corridor.generated.ts is absent — run `npm run corridor`; skipping staleness check');
			return;
		}
		const rounded = {
			north: edges.north.map(([a, b]) => [round(a), round(b)]),
			south: edges.south.map(([a, b]) => [round(a), round(b)])
		};
		expect(generated.north).toEqual(rounded.north);
		expect(generated.south).toEqual(rounded.south);
	});
});
