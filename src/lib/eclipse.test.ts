import { describe, it, expect } from 'vitest';
import { ECLIPSE_DATE, shadowCenter, sunMoonECEF, greatestEclipse, sunMoonHorizon, localCircumstances, sunset } from './eclipse';
import { TIMELINE_START, TIMELINE_END, FRAME_STEP_MS } from './config';
import { RAD_TO_DEG, EARTH_RADIUS_KM } from './constants';
import { REFERENCE, GREATEST, hhmmUtc, byName } from './testing/reference';
import { latLonToUnitVector, dot, clamp } from './shadow-globe/vec3';

const at = (hhmm: string) => new Date(`${ECLIPSE_DATE}T${hhmm}Z`);

/** Great-circle distance between two lat/lon points, in km. */
const distKm = (a: { lat: number; lon: number }, b: { lat: number; lon: number }) =>
	Math.acos(clamp(dot(latLonToUnitVector(a.lat, a.lon), latLonToUnitVector(b.lat, b.lon)), -1, 1)) * EARTH_RADIUS_KM;

describe('greatestEclipse', () => {
	const g = greatestEclipse();

	it('is a total eclipse with full obscuration', () => {
		expect(g.kind).toBe('total');
		expect(g.obscuration).toBeCloseTo(1, 3);
	});

	it('peaks at 17:45:46 UTC', () => {
		expect(Math.abs(g.date.getTime() - Date.parse(GREATEST.utc))).toBeLessThan(30_000);
	});

	it('lands in the North Atlantic off Iceland', () => {
		// A bounding box, not a point: a sign flip anywhere in the search would leave it.
		expect(g.lat).toBeGreaterThan(60);
		expect(g.lat).toBeLessThan(70);
		expect(g.lon).toBeGreaterThan(-32);
		expect(g.lon).toBeLessThan(-18);
	});
});

describe('shadowCenter', () => {
	it('agrees with the greatest-eclipse point at its instant', () => {
		// Two independent code paths (an ellipsoid intersection here, astronomy-engine's own search
		// there) must land on the same spot — this is the calibration test for the whole shadow track.
		const p = shadowCenter(new Date(GREATEST.utc));
		expect(p).not.toBeNull();
		expect(distKm(p!, greatestEclipse())).toBeLessThan(5);
	});

	it('returns null while the umbra has not reached Earth', () => {
		expect(shadowCenter(at('15:30:00'))).toBeNull();
		expect(shadowCenter(at('16:45:00'))).toBeNull(); // the timeline deliberately starts early
	});

	it('returns null once the umbra has left', () => {
		expect(shadowCenter(at('18:45:00'))).toBeNull();
	});

	it('touches down in the Arctic and leaves over Spain', () => {
		const first = shadowCenter(at('17:00:00'))!;
		const last = shadowCenter(at('18:32:00'))!;
		expect(first).not.toBeNull();
		expect(first.lat).toBeGreaterThan(70); // Siberian Arctic
		expect(last).not.toBeNull();
		expect(last.lat).toBeGreaterThan(38); // northern Spain / Balearics
		expect(last.lat).toBeLessThan(43);
		expect(Math.abs(last.lon)).toBeLessThan(10);
	});

	it('heads south continuously after crossing the pole', () => {
		// The track runs Siberia → over the pole → Iceland → Spain, so latitude only becomes monotonic
		// once past the pole. A sign error in the ellipsoid solve shows up as a reversal here.
		let prev = Infinity;
		for (let t = at('17:15:00').getTime(); t <= at('18:32:00').getTime(); t += 60_000) {
			const p = shadowCenter(new Date(t));
			expect(p, new Date(t).toISOString()).not.toBeNull();
			expect(p!.lat).toBeLessThan(prev);
			prev = p!.lat;
		}
	});

	it('never jumps further than the shadow can travel between frames', () => {
		// An antimeridian wrap handled wrongly, or a root picked from the far side of the ellipsoid,
		// would teleport the umbra thousands of km between frames. The physical ceiling is generous
		// because the ground speed genuinely spikes at ingress/egress, where the shadow grazes the limb.
		const speeds: { t: string; v: number }[] = [];
		let prev: { lat: number; lon: number } | null = null;
		let prevT = 0;
		for (let t = at('17:00:00').getTime(); t <= at('18:35:00').getTime(); t += FRAME_STEP_MS) {
			const p = shadowCenter(new Date(t));
			if (p && prev) speeds.push({ t: new Date(t).toISOString(), v: (distKm(prev, p) * 1000) / ((t - prevT) / 1000) });
			if (p) {
				prev = p;
				prevT = t;
			}
		}
		for (const s of speeds) expect(s.v, s.t).toBeLessThan(15_000);
	});

	it('crosses the mid-track at a steady ~1 km/s', () => {
		// Away from the limbs the umbra's ground speed is well-behaved; this is the tight bound that
		// would actually notice a small glitch in the track.
		let prev: { lat: number; lon: number } | null = null;
		for (let t = at('17:20:00').getTime(); t <= at('18:20:00').getTime(); t += FRAME_STEP_MS) {
			const p = shadowCenter(new Date(t))!;
			expect(p).not.toBeNull();
			if (prev) {
				const speed = (distKm(prev, p) * 1000) / (FRAME_STEP_MS / 1000);
				expect(speed, new Date(t).toISOString()).toBeGreaterThan(700);
				expect(speed, new Date(t).toISOString()).toBeLessThan(2000);
			}
			prev = p;
		}
	});

	it('stays on the near side of the ellipsoid', () => {
		// The solver takes the smaller root; a point on the far side would have the Sun below the horizon.
		const p = shadowCenter(new Date(GREATEST.utc))!;
		const { sun } = sunMoonHorizon(p.lat, p.lon, new Date(GREATEST.utc));
		expect(sun.alt).toBeGreaterThan(0);
	});

	it('produces finite coordinates in range for every landed frame', () => {
		for (let t = TIMELINE_START.getTime(); t <= TIMELINE_END.getTime(); t += FRAME_STEP_MS) {
			const p = shadowCenter(new Date(t));
			if (!p) continue;
			expect(Number.isFinite(p.lat) && Number.isFinite(p.lon)).toBe(true);
			expect(Math.abs(p.lat)).toBeLessThanOrEqual(90);
			expect(p.lon).toBeGreaterThanOrEqual(-180);
			expect(p.lon).toBeLessThan(180);
		}
	});
});

describe('sunMoonECEF', () => {
	const sm = sunMoonECEF(new Date(GREATEST.utc));

	it('returns a unit direction to the Sun', () => {
		expect(Math.hypot(...sm.sun)).toBeCloseTo(1, 12);
	});

	it('gives the Sun an angular radius of about 0.263°', () => {
		// Mid-August is near aphelion, so the disc sits at the small end of its 0.262–0.271° range.
		expect(sm.sunAngR * RAD_TO_DEG).toBeCloseTo(0.2631, 3);
	});

	it('places the Moon at roughly 60 Earth radii', () => {
		expect(Math.hypot(...sm.moon)).toBeGreaterThan(55);
		expect(Math.hypot(...sm.moon)).toBeLessThan(64);
	});

	it('puts the shadow axis through the Earth at greatest eclipse', () => {
		// The defining property of a central eclipse. Not "Moon and Sun look coincident from Earth's
		// centre" — the shadow lands at 65°N, so geocentrically they are ~0.9° apart; what must hold is
		// that the Moon→Sun line passes within one Earth radius of the centre.
		const sunDistEr = 696_000 / Math.sin(sm.sunAngR) / EARTH_RADIUS_KM;
		const axis = sm.sun.map((c, i) => c * sunDistEr - sm.moon[i]) as [number, number, number];
		const len = Math.hypot(...axis);
		const unit = axis.map((c) => c / len) as [number, number, number];
		const along = dot(sm.moon, unit);
		const perp = Math.hypot(...sm.moon.map((c, i) => c - along * unit[i]));
		expect(perp).toBeLessThan(1);
		expect(perp).toBeCloseTo(0.899, 2);
	});

	it('rotates with the Earth', () => {
		// ECEF is Earth-fixed: an hour later the Sun direction has swung ~15° westward.
		const later = sunMoonECEF(new Date(Date.parse(GREATEST.utc) + 3600_000));
		const sepDeg = Math.acos(clamp(dot(sm.sun, later.sun), -1, 1)) * RAD_TO_DEG;
		expect(sepDeg).toBeGreaterThan(14);
		expect(sepDeg).toBeLessThan(16);
	});
});

describe('sunMoonHorizon', () => {
	it('agrees with localCircumstances on the Sun altitude at maximum', () => {
		// Two different astronomy-engine paths feed B1 and B3; a mismatch would make the verdict and
		// the sky view disagree about where the Sun is.
		for (const site of REFERENCE) {
			const peak = localCircumstances(site.lat, site.lon)!.peak!;
			const { sun } = sunMoonHorizon(site.lat, site.lon, peak.time);
			expect(sun.alt, site.name).toBeCloseTo(peak.alt, 1);
		}
	});

	it('matches the tabulated altitude and azimuth at maximum', () => {
		for (const site of REFERENCE) {
			const peak = localCircumstances(site.lat, site.lon)!.peak!;
			const { sun } = sunMoonHorizon(site.lat, site.lon, peak.time);
			expect(sun.alt, `${site.name} altitude`).toBeCloseTo(site.sunAlt, 0);
			if (site.az !== undefined) expect(sun.az, `${site.name} azimuth`).toBeCloseTo(site.az, -0.5);
		}
	});

	it('has the Sun and Moon nearly coincident during totality', () => {
		const site = byName('Oviedo');
		const peak = localCircumstances(site.lat, site.lon)!.peak!;
		const { sun, moon } = sunMoonHorizon(site.lat, site.lon, peak.time);
		expect(Math.hypot(moon.az - sun.az, moon.alt - sun.alt)).toBeLessThan(0.6);
	});

	it('reports plausible distances', () => {
		const { sun, moon } = sunMoonHorizon(52.52, 13.405, at('18:08:00'));
		expect(sun.distAu).toBeCloseTo(1.013, 2); // near aphelion
		expect(moon.distAu * 149_597_870.7).toBeGreaterThan(350_000); // km
		expect(moon.distAu * 149_597_870.7).toBeLessThan(410_000);
	});

	it('treats observer elevation as parallax only, not as horizon dip', () => {
		// Worth pinning because it is counter-intuitive: 3000 m up, the Sun's *computed* altitude barely
		// moves (topocentric parallax is ~9"), because this is the altitude above the astronomical
		// horizontal — the ~1.8° horizon dip a mountain observer actually gains is not modelled. Anything
		// in the app that promises "you'll see it from the summit" needs its own dip term.
		const low = sunMoonHorizon(39.5696, 2.6502, at('18:31:00'), 0).sun.alt;
		const high = sunMoonHorizon(39.5696, 2.6502, at('18:31:00'), 3000).sun.alt;
		expect(Math.abs(high - low)).toBeLessThan
			(0.01);
	});
});

describe('localCircumstances', () => {
	it.each(REFERENCE)('matches the reference table for $name', (site) => {
		const c = localCircumstances(site.lat, site.lon);
		expect(c).not.toBeNull();
		expect(c!.kind).toBe(site.kind);
		expect(c!.obscuration).toBeCloseTo(site.obsc, 2);
		expect(hhmmUtc(c!.peak!.time)).toBe(site.maxUtc);
		expect(c!.peak!.alt).toBeCloseTo(site.sunAlt, 0);
	});

	it('confirms Munich beats Berlin', () => {
		// The headline claim in ARCHITECTURE.md: further south is closer to the path.
		const berlin = localCircumstances(byName('Berlin').lat, byName('Berlin').lon)!;
		const munich = localCircumstances(byName('München').lat, byName('München').lon)!;
		expect(munich.obscuration).toBeGreaterThan(berlin.obscuration);
	});

	it('reports contact times in ascending order', () => {
		for (const site of REFERENCE) {
			const c = localCircumstances(site.lat, site.lon)!;
			const times = [c.partialBegin, c.totalBegin, c.peak, c.totalEnd, c.partialEnd]
				.filter((e) => e !== null)
				.map((e) => e!.time.getTime());
			expect(times, site.name).toEqual([...times].sort((a, b) => a - b));
		}
	});

	it('reports totality only for total sites', () => {
		for (const site of REFERENCE) {
			const c = localCircumstances(site.lat, site.lon)!;
			if (site.kind === 'total') {
				expect(c.totalBegin, site.name).not.toBeNull();
				expect(c.totalEnd, site.name).not.toBeNull();
				const seconds = (c.totalEnd!.time.getTime() - c.totalBegin!.time.getTime()) / 1000;
				expect(seconds, site.name).toBeGreaterThan(30);
				expect(seconds, site.name).toBeLessThan(160);
			} else {
				expect(c.totalBegin, site.name).toBeNull();
				expect(c.totalEnd, site.name).toBeNull();
			}
		}
	});

	it('brackets the peak with the partial contacts', () => {
		for (const site of REFERENCE) {
			const c = localCircumstances(site.lat, site.lon)!;
			expect(c.partialBegin!.time.getTime(), site.name).toBeLessThan(c.peak!.time.getTime());
			// Palma's partial end falls below the horizon; astronomy-engine still reports it.
			expect(c.partialEnd!.time.getTime(), site.name).toBeGreaterThan(c.peak!.time.getTime());
		}
	});

	it('sweeps the maximum from west to east across the path', () => {
		const order = ['Reykjavík', 'Berlin', 'München', 'Oviedo', 'Palma'].map(
			(n) => localCircumstances(byName(n).lat, byName(n).lon)!.peak!.time.getTime()
		);
		expect(order).toEqual([...order].sort((a, b) => a - b));
	});

	it('falls outside the animation window nowhere along the path', () => {
		for (const site of REFERENCE) {
			const peak = localCircumstances(site.lat, site.lon)!.peak!.time.getTime();
			expect(peak, site.name).toBeGreaterThan(TIMELINE_START.getTime());
			expect(peak, site.name).toBeLessThan(TIMELINE_END.getTime());
		}
	});

	it('finds a later eclipse for locations this one misses', () => {
		// Documented behaviour, not an endorsement: SearchLocalSolarEclipse scans FORWARD from eclipse
		// day, so a location outside the 2026 event silently gets the next one it can see. Callers that
		// care must compare the returned date against ECLIPSE_DATE.
		const sydney = localCircumstances(-33.8688, 151.2093);
		expect(sydney).not.toBeNull();
		expect(sydney!.peak!.time.toISOString().slice(0, 10)).not.toBe(ECLIPSE_DATE);
	});
});

describe('sunset', () => {
	it('is after the local maximum everywhere on the path', () => {
		// An eclipse computed after sunset would be a catastrophic sign error, and the B3 slider
		// window is built from these two instants.
		for (const site of REFERENCE) {
			const peak = localCircumstances(site.lat, site.lon)!.peak!.time.getTime();
			const set = sunset(site.lat, site.lon);
			expect(set, site.name).not.toBeNull();
			expect(set!.getTime(), site.name).toBeGreaterThan(peak);
		}
	});

	it('falls on eclipse day for every reference site', () => {
		for (const site of REFERENCE) {
			expect(sunset(site.lat, site.lon)!.toISOString().slice(0, 10), site.name).toBe(ECLIPSE_DATE);
		}
	});

	it('sets earlier in the east', () => {
		const palma = sunset(byName('Palma').lat, byName('Palma').lon)!;
		const oviedo = sunset(byName('Oviedo').lat, byName('Oviedo').lon)!;
		expect(palma.getTime()).toBeLessThan(oviedo.getTime());
	});

	it('returns null under the midnight Sun', () => {
		expect(sunset(89, 0)).toBeNull();
	});

	it('leaves Palma only ~18 minutes of eclipse before the Sun goes down', () => {
		// The tightest case on the path, and the reason the loupe has to render a sunset horizon at all.
		const site = byName('Palma');
		const peak = localCircumstances(site.lat, site.lon)!.peak!.time.getTime();
		const minutes = (sunset(site.lat, site.lon)!.getTime() - peak) / 60_000;
		expect(minutes).toBeGreaterThan(10);
		expect(minutes).toBeLessThan(25);
	});
});
