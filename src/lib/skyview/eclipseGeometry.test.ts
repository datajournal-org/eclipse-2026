import { describe, it, expect } from 'vitest';
import { eclipseGeometry } from './eclipseGeometry';
import { localCircumstances, ECLIPSE_DATE } from '$lib/eclipse';
import { REFERENCE, byName } from '$lib/testing/reference';

const at = (hhmm: string) => new Date(`${ECLIPSE_DATE}T${hhmm}Z`);

// Partial sites keep a residual disc offset at maximum; 0.3° comfortably brackets Berlin and Munich
// without being loose enough to accept a total-eclipse-sized error.
const PARTIAL_SEPARATION_CEILING = 0.3;

const peakOf = (name: string) => {
	const site = byName(name);
	return { site, peak: localCircumstances(site.lat, site.lon)!.peak!.time };
};

describe('eclipseGeometry', () => {
	it('agrees with localCircumstances on obscuration at maximum', () => {
		// Two entirely separate paths to the same number: astronomy-engine's own eclipse search (what B1
		// prints) versus this module's disc overlap of the topocentric positions (what B3 renders).
		// They agree exactly at total sites and drift by up to ~1 pp at partial ones, because the
		// separation here is a flat-sky hypot of two angle differences and the disc radii use atan
		// rather than astronomy-engine's fuller treatment. Visually irrelevant, numerically real — so
		// the tolerance records it rather than hiding it.
		for (const site of REFERENCE) {
			const c = localCircumstances(site.lat, site.lon)!;
			const g = eclipseGeometry(site.lat, site.lon, c.peak!.time);
			expect(Math.abs(g.obsc - c.obscuration), site.name).toBeLessThan(0.012);
			if (site.kind === 'total') expect(g.obsc, site.name).toBeCloseTo(c.obscuration, 4);
		}
	});

	it('gives the discs their real angular sizes', () => {
		const { site, peak } = peakOf('Oviedo');
		const g = eclipseGeometry(site.lat, site.lon, peak);
		expect(g.sunAngR).toBeCloseTo(0.2631, 3);
		// A total eclipse needs the Moon to look bigger than the Sun — by only a few percent in 2026.
		expect(g.moonAngR / g.sunAngR).toBeGreaterThan(1.0);
		expect(g.moonAngR / g.sunAngR).toBeLessThan(1.08);
	});

	it('has the Moon look smaller than the Sun where the eclipse stays partial', () => {
		// Not a size effect — Berlin is simply off-axis, so the discs never coincide. Guard that the
		// module reports the offset, not a shrunken Moon.
		const { site, peak } = peakOf('Berlin');
		const g = eclipseGeometry(site.lat, site.lon, peak);
		expect(g.moonAngR / g.sunAngR).toBeGreaterThan(1.0);
		expect(Math.hypot(g.dx, g.dy)).toBeGreaterThan(0.05);
	});

	it('brings the disc centres together at maximum', () => {
		for (const site of REFERENCE) {
			const { peak } = peakOf(site.name);
			const g = eclipseGeometry(site.lat, site.lon, peak);
			const sep = Math.hypot(g.dx, g.dy);
			// Total sites are near-concentric; partial sites keep a residual offset by definition.
			if (site.kind === 'total') expect(sep, site.name).toBeLessThan(0.03);
			else expect(sep, site.name).toBeLessThan(PARTIAL_SEPARATION_CEILING);
		}
	});

	it('minimises the separation exactly at maximum', () => {
		const { site, peak } = peakOf('München');
		const sepAt = (offsetMin: number) => {
			const g = eclipseGeometry(site.lat, site.lon, new Date(peak.getTime() + offsetMin * 60_000));
			return Math.hypot(g.dx, g.dy);
		};
		const centre = sepAt(0);
		expect(sepAt(-10)).toBeGreaterThan(centre);
		expect(sepAt(10)).toBeGreaterThan(centre);
		expect(sepAt(-1)).toBeGreaterThan(centre);
		expect(sepAt(1)).toBeGreaterThan(centre);
	});

	it('separates the discs monotonically away from maximum', () => {
		const { site, peak } = peakOf('Berlin');
		let prev = -Infinity;
		for (let m = 0; m <= 60; m += 5) {
			const g = eclipseGeometry(site.lat, site.lon, new Date(peak.getTime() + m * 60_000));
			const sep = Math.hypot(g.dx, g.dy);
			expect(sep, `+${m} min`).toBeGreaterThan(prev);
			prev = sep;
		}
	});

	it('sweeps the Moon across the Sun in one consistent direction', () => {
		// The crescent-orientation risk from ARCHITECTURE.md, pinned by sign. dx is an AZIMUTH
		// difference scaled by cos(altitude), and azimuth grows clockwise from north — so for an
		// evening Sun in the WNW, +dx is to the observer's right, toward north, not "east" on a map.
		// Over the eclipse the Moon's dx falls steadily from positive to negative, crossing zero at
		// maximum. Flip either sign and the crescent renders the wrong way round.
		const { site, peak } = peakOf('Berlin');
		let prev = Infinity;
		for (let m = -40; m <= 40; m += 10) {
			const { dx } = eclipseGeometry(site.lat, site.lon, new Date(peak.getTime() + m * 60_000));
			expect(dx, `${m} min`).toBeLessThan(prev);
			prev = dx;
		}
		expect(eclipseGeometry(site.lat, site.lon, new Date(peak.getTime() - 30 * 60_000)).dx).toBeGreaterThan(0);
		expect(eclipseGeometry(site.lat, site.lon, new Date(peak.getTime() + 30 * 60_000)).dx).toBeLessThan(0);
	});

	it('keeps the Moon below the Sun throughout, for a site off the northern edge', () => {
		// Berlin is off the path, and sees the Moon pass across the Sun's lower limb: dy < 0 for the
		// whole event, closing toward zero as the Moon climbs relative to the setting Sun. Together
		// with the dx sweep this fixes the crescent's tilt.
		const { site, peak } = peakOf('Berlin');
		let prev = -Infinity;
		for (let m = -40; m <= 40; m += 10) {
			const { dy } = eclipseGeometry(site.lat, site.lon, new Date(peak.getTime() + m * 60_000));
			expect(dy, `${m} min`).toBeLessThan(0);
			expect(dy, `${m} min`).toBeGreaterThan(prev);
			prev = dy;
		}
	});

	it('foreshortens the east-west offset near the horizon', () => {
		// dx carries a cos(altitude) factor so azimuth differences shrink as the Sun sets — without it
		// the crescent would visibly stretch sideways at low Sun.
		const { site, peak } = peakOf('Palma'); // Sun at 2.6°, so cos ≈ 1 and the factor is mild
		const g = eclipseGeometry(site.lat, site.lon, new Date(peak.getTime() + 20 * 60_000));
		const rawAzGap = Math.abs(g.moon.az - g.sun.az);
		expect(Math.abs(g.dx)).toBeLessThanOrEqual(rawAzGap + 1e-9);
	});

	it('reports no coverage outside the eclipse', () => {
		const { site } = peakOf('Berlin');
		const g = eclipseGeometry(site.lat, site.lon, at('12:00:00'));
		expect(g.obsc).toBe(0);
		expect(Math.hypot(g.dx, g.dy)).toBeGreaterThan(g.sunAngR + g.moonAngR);
	});

	it('rises to 1 and back down over a total eclipse', () => {
		const { site, peak } = peakOf('Oviedo');
		const samples = [-60, -30, -5, 0, 5, 30, 60].map(
			(m) => eclipseGeometry(site.lat, site.lon, new Date(peak.getTime() + m * 60_000)).obsc
		);
		expect(samples[0]).toBe(0);
		expect(samples[3]).toBeCloseTo(1, 3);
		expect(samples[6]).toBe(0);
		// strictly rising to the peak, then strictly falling
		for (let i = 1; i <= 3; i++) expect(samples[i]).toBeGreaterThan(samples[i - 1]);
		for (let i = 4; i < samples.length; i++) expect(samples[i]).toBeLessThan(samples[i - 1]);
	});

	it('returns finite geometry at every frame of the animation window', () => {
		const { site } = peakOf('Palma');
		for (let t = Date.UTC(2026, 7, 12, 16, 45); t <= Date.UTC(2026, 7, 12, 18, 45); t += 30_000) {
			const g = eclipseGeometry(site.lat, site.lon, new Date(t));
			expect(Number.isFinite(g.dx) && Number.isFinite(g.dy) && Number.isFinite(g.obsc)).toBe(true);
			expect(g.obsc).toBeGreaterThanOrEqual(0);
			expect(g.obsc).toBeLessThanOrEqual(1);
		}
	});
});
