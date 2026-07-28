import { describe, it, expect } from 'vitest';
import * as Astronomy from 'astronomy-engine';
import { gmstDeg, horizonFor, skyDarkness, visibleSkyObjects } from './skyObjects';
import { SKY_OBJECTS } from './sky.generated';
import { BRIGHT_STARS } from './starCatalog';
import { byName } from '$lib/testing/reference';
import { TIMELINE_START, TIMELINE_END } from '$lib/config';

const OVIEDO = byName('Oviedo');
const MAX = new Date('2026-08-12T18:27:00Z');

describe('horizonFor', () => {
	/**
	 * The whole reason this module can skip astronomy-engine at runtime: a rotation by local sidereal time
	 * gives the same answer as the library's full `Horizon`, because the build already folded precession,
	 * nutation and aberration into the stored coordinates. If that ever stops being true, it stops here.
	 */
	it.each([
		['Oviedo', OVIEDO.lat, OVIEDO.lon],
		['Reykjavík', 64.1466, -21.9426],
		['Sydney (southern hemisphere)', -33.87, 151.21],
		['Quito (equator)', -0.18, -78.47],
		['Longyearbyen (high latitude)', 78.22, 15.65]
	])('agrees with astronomy-engine at %s', (_label, lat, lon) => {
		const observer = new Astronomy.Observer(lat, lon, 0);
		let checked = 0;
		for (const object of SKY_OBJECTS) {
			const mine = horizonFor(object.ra, object.dec, lat, lon, MAX);
			// Feed astronomy-engine the same of-date coordinates, so only the rotation is under test.
			const theirs = Astronomy.Horizon(MAX, observer, object.ra, object.dec, 'normal');
			// Only what can be drawn. Well below the horizon the two taper refraction differently — this
			// module clamps where astronomy-engine fades toward the nadir — but nothing there is ever
			// rendered, so matching it would be dead precision.
			if (theirs.altitude < -1) continue;
			checked++;
			// 0.01° = 36 arcsec. The residual is how the two apply refraction, not the rotation, and at
			// B3's ~0.1°/px it is a seventh of a pixel — far below anything that can be drawn.
			// SKY_OBJECTS is nameless, so failures are labelled by magnitude and position instead.
			const label = `mag ${object.mag} @ ra ${object.ra.toFixed(3)}h`;
			expect(Math.abs(mine.alt - theirs.altitude), `${label} altitude`).toBeLessThan(0.01);
			// Azimuth is meaningless at the zenith, and wraps at 360. Weigh the difference by cos(alt):
			// azimuth DEGREES shrink toward the zenith (a high star sweeps many of them across few pixels),
			// so the screen-space error is the cross-track angle, not the raw azimuth delta.
			if (Math.abs(mine.alt) < 89.5) {
				const delta = Math.abs(((mine.az - theirs.azimuth + 540) % 360) - 180);
				const crossTrack = delta * Math.cos((mine.alt * Math.PI) / 180);
				expect(crossTrack, `${label} azimuth (${mine.az} vs ${theirs.azimuth})`).toBeLessThan(0.01);
			}
		}
		expect(checked, 'no object was above the horizon — the comparison proved nothing').toBeGreaterThan(20);
	});

	it('tracks the sky turning over the eclipse window', () => {
		// Earth turns 15°/h, so an object's hour angle must advance with it rather than sit still. Any
		// fixed equatorial point shows it; Vega's J2000 position (from the still-named source catalogue)
		// keeps the test readable.
		const vega = BRIGHT_STARS.find((s) => s.name === 'Vega')!;
		const start = horizonFor(vega.ra, vega.dec, OVIEDO.lat, OVIEDO.lon, MAX);
		const later = horizonFor(vega.ra, vega.dec, OVIEDO.lat, OVIEDO.lon, new Date(MAX.getTime() + 3600_000));
		expect(Math.abs(later.az - start.az)).toBeGreaterThan(1);
	});

	it('puts a near-pole star due north, within its own circle of the pole', () => {
		// Polaris sits 0.74° off the pole, so from Berlin its altitude circles 51.3°..52.7° — the naive
		// "altitude of the pole equals the latitude" only holds for the pole itself.
		const north = horizonFor(2.53, 89.26, 52, 13, MAX);
		expect(Math.abs(north.alt - 52)).toBeLessThan(0.8);
		expect(Math.min(north.az, 360 - north.az)).toBeLessThan(1);
	});
});

describe('gmstDeg', () => {
	it('matches astronomy-engine sidereal time', () => {
		for (const iso of ['2026-08-12T00:00:00Z', '2026-08-12T18:27:00Z', '2000-01-01T12:00:00Z']) {
			const when = new Date(iso);
			const mine = gmstDeg(when);
			const theirs = (((Astronomy.SiderealTime(when) * 15) % 360) + 360) % 360;
			expect(Math.abs(((mine - theirs + 540) % 360) - 180), iso).toBeLessThan(0.01);
		}
	});
});

describe('skyDarkness', () => {
	it('is zero for every partial eclipse a reader is likely to be under', () => {
		// The concept's central honesty point: 90 % is not almost total, and it reveals nothing. Central
		// Europe sees 85–92 %, so this is the range that has to stay empty.
		for (const obsc of [0, 0.5, 0.85, 0.9, 0.95]) expect(skyDarkness(obsc, 10)).toBe(0);
	});

	it('rises only in the last few percent, and gradually', () => {
		expect(skyDarkness(0.95, 10)).toBe(0);
		// Monotonic and smooth across the run-up, so the sky fills in rather than snapping on.
		const steps = [0.96, 0.97, 0.98, 0.99, 1].map((o) => skyDarkness(o, 10));
		for (let i = 1; i < steps.length; i++) expect(steps[i]).toBeGreaterThan(steps[i - 1]);
		expect(steps[0]).toBeLessThan(0.3); // 96 % is barely dark at all
	});

	it('is deeper when the Sun is already low', () => {
		expect(skyDarkness(1, 3)).toBeGreaterThan(skyDarkness(1, 25));
	});
});

describe('visibleSkyObjects', () => {
	it('shows nothing at a partial location', () => {
		expect(visibleSkyObjects(52.52, 13.405, MAX, 0.848, 3.5)).toEqual([]);
	});

	it('shows Venus first at Oviedo during totality', () => {
		const seen = visibleSkyObjects(OVIEDO.lat, OVIEDO.lon, MAX, 1, 10.4);
		expect(seen.length).toBeGreaterThan(3);
		// Anonymous data: Venus is identified as the object brighter than mag -4 — nothing else is
		// within two magnitudes of it (Sirius, the brightest star, is -1.44).
		const venus = seen.find((p) => p.object.mag < -4);
		expect(venus, 'Venus is the one object everyone is told to look for').toBeDefined();
		expect(venus!.alt).toBeGreaterThan(20);
		expect(venus!.brightness).toBeCloseTo(1, 1);
	});

	it('never returns anything below the horizon', () => {
		for (const [lat, lon] of [
			[OVIEDO.lat, OVIEDO.lon],
			[-33.87, 151.21]
		]) {
			for (const p of visibleSkyObjects(lat, lon, MAX, 1, 5)) expect(p.alt).toBeGreaterThan(0);
		}
	});

	it('drops the faintest stars as the sky brightens again', () => {
		const deep = visibleSkyObjects(OVIEDO.lat, OVIEDO.lon, MAX, 1, 10.4);
		const shallow = visibleSkyObjects(OVIEDO.lat, OVIEDO.lon, MAX, 0.99, 10.4);
		expect(shallow.length).toBeLessThan(deep.length);
	});

	const venusAt = (obsc: number) =>
		visibleSkyObjects(OVIEDO.lat, OVIEDO.lon, MAX, obsc, 10.4).find((p) => p.object.mag < -4); // Venus

	it('fades everything in and out rather than switching it on', () => {
		// What a reader sees scrubbing into totality: the same object getting brighter, not appearing at
		// full strength. Venus is the one bright enough to be there across the whole run-up.
		const ramp = [0.96, 0.97, 0.98, 0.99, 1].map((o) => venusAt(o)?.brightness ?? 0);
		for (let i = 1; i < ramp.length; i++) expect(ramp[i], `at step ${i}`).toBeGreaterThanOrEqual(ramp[i - 1]);
		expect(ramp[0]).toBeGreaterThan(0); // present on entry...
		expect(ramp[0]).toBeLessThan(0.65); // ...but visibly dimmer than at totality (compressed ramp)
		expect(ramp[1]).toBeGreaterThan(ramp[0]); // genuinely ramping, not flat
		expect(ramp[ramp.length - 1]).toBe(1); // saturating only at the end
	});

	it('compresses the ramp so near-threshold objects are seen, not merely present', () => {
		// The linear ramp buried the sky: at totality most catalogue stars clear the limit by well under a
		// magnitude, and headroom/3 opacity left them at ~0.2 over a still-luminous twilight veil — the
		// scene read as "three planets, no stars". The square root lifts exactly that faint majority while
		// leaving anything saturated where it was.
		const seen = visibleSkyObjects(OVIEDO.lat, OVIEDO.lon, MAX, 1, 10.4);
		const faint = seen.filter((p) => p.headroom > 0.05 && p.headroom < 2.5);
		expect(faint.length).toBeGreaterThan(3); // the case exists — most of the sky is near the limit
		for (const p of faint) {
			expect(p.brightness, `mag ${p.object.mag}`).toBeCloseTo(Math.sqrt(p.headroom / 3), 6);
			expect(p.brightness, `mag ${p.object.mag}`).toBeGreaterThan(p.headroom / 3); // above the old linear ramp
		}
	});

	it('keeps growing after the opacity has saturated', () => {
		// `headroom` is what the renderer turns into pixels. It has to go on rising once opacity caps, or
		// the deepest part of totality would look identical to its beginning — and a point source has no
		// angular size of its own, so how big it looks IS how much light arrives.
		const heads = [0.96, 0.97, 0.98, 0.99, 1].map((o) => venusAt(o)?.headroom ?? 0);
		for (let i = 1; i < heads.length; i++) expect(heads[i], `at step ${i}`).toBeGreaterThan(heads[i - 1]);
		expect(venusAt(0.98)!.brightness).toBe(1); // opacity is already capped here...
		expect(heads[4]).toBeGreaterThan(heads[2] * 1.2); // ...yet it keeps swelling afterwards
	});

	it('gives a brighter object more headroom than a fainter one in the same sky', () => {
		const seen = visibleSkyObjects(OVIEDO.lat, OVIEDO.lon, MAX, 1, 10.4);
		const venus = seen.find((p) => p.object.mag < -4)!; // Venus
		const faintest = seen.reduce((a, b) => (a.object.mag > b.object.mag ? a : b));
		expect(venus.headroom).toBeGreaterThan(faintest.headroom);
		expect(faintest.headroom).toBeGreaterThan(0);
	});

	it('costs an object headroom for sitting low in the horizon haze', () => {
		// The same object placed low must come out dimmer and smaller than it would high up, because it is
		// seen through more air and the horizon's leftover glow.
		const seen = visibleSkyObjects(OVIEDO.lat, OVIEDO.lon, MAX, 1, 10.4);
		const low = seen.filter((p) => p.alt < 6);
		expect(low.length, 'no low object to compare').toBeGreaterThan(0);
		for (const p of low) {
			// Headroom below what an unextinguished object of this magnitude would have had.
			const unextinguished = seen.find((q) => q.alt > 20 && Math.abs(q.object.mag - p.object.mag) < 0.6);
			if (unextinguished) expect(p.headroom, `mag ${p.object.mag}`).toBeLessThan(unextinguished.headroom);
		}
	});
});

describe('the catalogue', () => {
	it('holds the 285 stars of magnitude 3.5 or brighter', () => {
		// 3.5 is the totality naked-eye limit the display model uses (limitingMag) — catalogue and
		// renderer must agree, or the last magnitude of sky would be silently absent.
		expect(BRIGHT_STARS).toHaveLength(285);
		for (const s of BRIGHT_STARS) {
			expect(s.mag, s.name).toBeLessThanOrEqual(3.5);
			expect(s.ra, s.name).toBeGreaterThanOrEqual(0);
			expect(s.ra, s.name).toBeLessThan(24);
			expect(Math.abs(s.dec), s.name).toBeLessThanOrEqual(90);
		}
		expect(new Set(BRIGHT_STARS.map((s) => s.name)).size).toBe(285);
	});

	it('keeps the classic bright list intact ahead of the faint extension', () => {
		// The first 93 entries are the old mag ≤ 2.5 catalogue, byte-for-byte: the extension to 3.5 was
		// append-only, so every previously pinned position still holds.
		expect(BRIGHT_STARS[92].name).toBe('Markab');
		expect(BRIGHT_STARS.slice(0, 93).every((s) => s.mag <= 2.5)).toBe(true);
		expect(BRIGHT_STARS.slice(93).every((s) => s.mag > 2.5)).toBe(true);
	});

	it('pins a few positions against independently known values', () => {
		// Spot-check against catalogue values that are common knowledge, so a mangled import cannot pass.
		const at = (name: string) => BRIGHT_STARS.find((s) => s.name === name)!;
		expect(at('Sirius').ra).toBeCloseTo(6.752, 2); // 06h 45m
		expect(at('Sirius').dec).toBeCloseTo(-16.716, 2); // -16° 43'
		expect(at('Vega').ra).toBeCloseTo(18.616, 2); // 18h 37m
		expect(at('Vega').dec).toBeCloseTo(38.784, 2); // +38° 47'
		expect(at('Betelgeuse').ra).toBeCloseTo(5.919, 2);
		expect(at('Sirius').mag).toBeLessThan(-1.4); // the brightest star in the sky
	});

	it('carries the planets, precessed and merged into one list', () => {
		// The rows are fully anonymous — no name, no kind — so the planets are recognisable only by what
		// makes them planets: 285 catalogue stars plus five extra rows, topped by objects brighter than
		// any star. Venus (mag < -4) is unmistakable; Venus and Jupiter both outshine Sirius (-1.44).
		expect(SKY_OBJECTS).toHaveLength(285 + 5);
		expect(SKY_OBJECTS.filter((o) => o.mag < -4)).toHaveLength(1);
		expect(SKY_OBJECTS.filter((o) => o.mag < -1.5)).toHaveLength(2);
		// Precession since J2000 is ~0.35°, so of-date coordinates must differ from the catalogue's.
		// Sirius is the one row at exactly its catalogue magnitude of -1.44.
		const sirius = SKY_OBJECTS.filter((o) => o.mag === -1.44);
		expect(sirius).toHaveLength(1);
		expect(Math.abs(sirius[0].ra - BRIGHT_STARS.find((s) => s.name === 'Sirius')!.ra)).toBeGreaterThan(0.005);
	});
});

describe('sky.generated.ts', () => {
	/**
	 * The same guard the corridor has: the checked-in file must still be what the script produces. It is
	 * committed rather than built on demand, so nothing else would notice it drifting from the catalogue
	 * it was derived from.
	 */
	it('is not stale', () => {
		const GEOCENTRE = new Astronomy.Observer(0, 0, 0);
		const MID = new Date((TIMELINE_START.getTime() + TIMELINE_END.getTime()) / 2);

		for (const star of BRIGHT_STARS) {
			Astronomy.DefineStar(Astronomy.Body.Star1, star.ra, star.dec, 1000);
			const eq = Astronomy.Equator(Astronomy.Body.Star1, MID, GEOCENTRE, true, true);
			// The generated rows are nameless, so match each catalogue star back by where the build math
			// says it must sit, plus its magnitude — the mag disambiguates true co-located pairs like
			// Castor and Castor B, which share coordinates but not brightness.
			const matches = SKY_OBJECTS.filter(
				(o) => o.mag === star.mag && Math.abs(o.ra - eq.ra) < 5e-4 && Math.abs(o.dec - eq.dec) < 5e-3
			);
			expect(matches, `${star.name} missing from the generated file (or matched twice)`).toHaveLength(1);
		}

		for (const body of [
			Astronomy.Body.Venus,
			Astronomy.Body.Jupiter,
			Astronomy.Body.Mercury,
			Astronomy.Body.Mars,
			Astronomy.Body.Saturn
		]) {
			const eq = Astronomy.Equator(body, MID, GEOCENTRE, true, true);
			// Nameless rows: the planet is the one row at the position the ephemeris says it must occupy.
			const matches = SKY_OBJECTS.filter((o) => Math.abs(o.ra - eq.ra) < 5e-4 && Math.abs(o.dec - eq.dec) < 5e-3);
			expect(matches, `${body} missing from the generated file (or matched twice)`).toHaveLength(1);
		}
	});

	it('holds each planet still enough for one position to cover the window', () => {
		// What the build script asserts, restated as a test: if the timeline were ever widened, a single
		// mid-window position would stop being good enough and this is where that shows up.
		//
		// The quantity that matters is the error against the position actually STORED — the mid-window one
		// — at the worst instant, not the total travel from end to end. Mercury moves fastest, ~0.15° across
		// the whole window, so the stored position is never more than half that wrong: under a pixel at
		// B3's ~0.1°/px.
		const GEOCENTRE = new Astronomy.Observer(0, 0, 0);
		const MID = new Date((TIMELINE_START.getTime() + TIMELINE_END.getTime()) / 2);
		for (const name of ['Venus', 'Mercury', 'Mars', 'Jupiter', 'Saturn']) {
			// Recover each planet's row by its mid-window position (the staleness test above proves the
			// mapping is one-to-one).
			const mid = Astronomy.Equator(name as Astronomy.Body, MID, GEOCENTRE, true, true);
			const stored = SKY_OBJECTS.find((o) => Math.abs(o.ra - mid.ra) < 5e-4 && Math.abs(o.dec - mid.dec) < 5e-3)!;
			expect(stored, name).toBeDefined();
			const worst = Math.max(
				...[TIMELINE_START, TIMELINE_END].map((edge) => {
					const at = Astronomy.Equator(name as Astronomy.Body, edge, GEOCENTRE, true, true);
					const dRa = (at.ra - stored.ra) * 15 * Math.cos((stored.dec * Math.PI) / 180);
					return Math.hypot(dRa, at.dec - stored.dec);
				})
			);
			expect(worst, `${name} strays ${worst.toFixed(3)}° from its stored position`).toBeLessThan(0.1);
		}
	});
});
