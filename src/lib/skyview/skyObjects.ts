// Where the stars and planets are, and how visible they are, for one observer at one instant.
//
// The catalogue positions (sky.generated.ts) are equatorial and observer-independent, so the only runtime
// work is the rotation into the observer's horizon frame — a few lines of trigonometry driven by local
// sidereal time. That is deliberately NOT done with astronomy-engine: its `Horizon` would re-derive
// precession, nutation and aberration for every object on every scrub step, and the build has already
// baked those into the stored coordinates. `skyObjects.test.ts` holds this cheap version to
// astronomy-engine's answer as its oracle, so the shortcut stays honest.
import { DEG_TO_RAD as D2R, RAD_TO_DEG as R2D } from '$lib/constants';
import { SKY_OBJECTS, type SkyObject } from './sky.generated';

export type PlacedObject = {
	object: SkyObject;
	/** Altitude above the true horizon, degrees. Negative means below it. */
	alt: number;
	/** Compass azimuth, degrees (0 = north, clockwise). */
	az: number;
	/** 0..1 opacity — how strongly to draw it. 0 = do not draw. */
	brightness: number;
	/**
	 * Magnitudes by which this object outshines the faintest thing the sky can currently show. 0 means it
	 * is exactly at the threshold; Venus at full totality reaches about 6.
	 *
	 * This is the one quantity that captures "how bright does it look from here, right now" — it folds in
	 * the object's own magnitude, how dark the sky is, and how much haze it is seen through. The renderer
	 * derives BOTH size and opacity from it, because a point source has no angular size of its own: how
	 * big it looks is purely how much light arrives.
	 */
	headroom: number;
};

/**
 * Greenwich mean sidereal time, in degrees.
 *
 * IAU 1982 series, which is good to a fraction of an arcsecond for our epoch — far finer than a pixel at
 * B3's ~0.1°/px scale, and it needs no ephemeris.
 */
export function gmstDeg(date: Date | number): number {
	const jd = (typeof date === 'number' ? date : date.getTime()) / 86400000 + 2440587.5;
	const T = (jd - 2451545.0) / 36525;
	const gmst = 280.46061837 + 360.98564736629 * (jd - 2451545.0) + T * T * (0.000387933 - T / 38710000);
	return ((gmst % 360) + 360) % 360;
}

/**
 * Atmospheric refraction, in degrees, for a geometric altitude — the amount the air lifts an object above
 * where the geometry alone would put it (about half a degree at the horizon, nothing overhead).
 *
 * Saemundsson's formula, the same one astronomy-engine uses in `'normal'` mode, so the stars share the
 * Sun's convention: `placeSun` positions the disc using a refracted altitude, and an unrefracted star
 * would sit slightly low next to it near the horizon — precisely where this scene spends its time.
 */
export function refractionDeg(altDeg: number): number {
	if (altDeg > 90) return 0;
	const h = Math.max(-1, altDeg); // the formula diverges near -5.11°; astronomy-engine clamps the same way
	return 1.02 / Math.tan((h + 10.3 / (h + 5.11)) * D2R) / 60;
}

/** Rotate an equatorial position (RA hours, Dec degrees) into one observer's apparent horizon frame. */
export function horizonFor(
	raHours: number,
	decDeg: number,
	latDeg: number,
	lonDeg: number,
	date: Date | number
): { alt: number; az: number } {
	const lst = gmstDeg(date) + lonDeg; // local sidereal time, degrees
	const hourAngle = (lst - raHours * 15) * D2R; // how far the object is past the meridian
	const dec = decDeg * D2R;
	const lat = latDeg * D2R;

	const sinAlt = Math.sin(dec) * Math.sin(lat) + Math.cos(dec) * Math.cos(lat) * Math.cos(hourAngle);
	const alt = Math.asin(Math.max(-1, Math.min(1, sinAlt)));
	// atan2 form rather than acos: it is correct in every quadrant without a sign fix-up afterwards.
	const az = Math.atan2(-Math.cos(dec) * Math.cos(lat) * Math.sin(hourAngle), Math.sin(dec) - Math.sin(lat) * sinAlt);
	const altDeg = alt * R2D;
	return { alt: altDeg + refractionDeg(altDeg), az: (((az * R2D) % 360) + 360) % 360 };
}

/**
 * How dark the sky is, 0 (full daylight) to 1 (dark enough for the faintest star in the catalogue).
 *
 * Two things darken it, and both must happen: the Moon has to cover essentially the whole Sun, and even
 * then the sky only goes deep-twilight rather than night. `obsc` does almost all the work — below ~0.98
 * nothing is visible at all, which is the point the concept keeps making about "90 % is almost total"
 * being wrong. A partial eclipse never reveals a single star.
 */
export function skyDarkness(obscuration: number, sunAltDeg: number): number {
	// 0 at 95 % coverage, 1 at 99.9 %. The window starts where the scene's own twilight veil is already
	// well under way, so the sky fills in gradually instead of in one step — at 30 s per slider frame a
	// ramp that began at 98 % had barely two frames to work with. The limiting magnitude keeps this
	// honest: at 95 % it is about -4, so the only thing that clears it is Venus, faintly. Which is right —
	// Venus is findable in a deep partial eclipse. Nothing else joins it until the sky truly goes.
	const eclipse = Math.max(0, Math.min(1, (obscuration - 0.95) / 0.049));
	// A low Sun helps — the same eclipse is darker at 3° than at 25°, because twilight has already begun.
	const dusk = Math.max(0, Math.min(1, (30 - sunAltDeg) / 30));
	return eclipse * (0.75 + 0.25 * dusk);
}

/**
 * Limiting magnitude for a given sky darkness. Even at maximum totality the sky is roughly deep twilight,
 * not night: eclipse observing guides (Espenak) put the naked-eye limit at about +3.5 — second- and
 * third-magnitude stars, not the sixth-magnitude ones a dark site gives. 3.5 is therefore both the
 * catalogue's limit and the deepest this ever reaches, and the fade below keeps the last magnitude of
 * that range appropriately faint. A high Sun holds the sky brighter: Reykjavík's 25° totality only
 * reaches a limit of ~1.9, so its sky stays sparser than Oviedo's — which is physical, not a bug.
 */
const limitingMag = (darkness: number) => -5 + 8.5 * darkness;

/** Magnitudes of headroom over which an object ramps from just-visible to fully drawn. */
const FADE_MAGS = 3;

/**
 * Display compression for the headroom → opacity ramp (and, mirrored in `frameSync.placeSkyObjects`,
 * the headroom → size ramp).
 *
 * Headroom is log-flux (magnitudes), which is already the perceptually uniform scale — but mapping it
 * LINEARLY to opacity still buried the sky: at totality most catalogue stars sit within a magnitude of
 * the limit, and a 2 px dot at 0.17 alpha over the still-luminous twilight veil simply does not read.
 * Meanwhile everything at mag 0 and brighter saturated, so the scene was "three planets, no stars" —
 * more lopsided than the real experience, where Venus dominates but a dozen stars are findable.
 *
 * A square root (Stevens' power law for point sources has an exponent well below 1) lifts the faint end
 * without moving the top: at half a magnitude of headroom the opacity more than doubles (0.17 → 0.41),
 * while anything that already reached 1.0 stays exactly there.
 */
const RAMP_EXPONENT = 0.5;

/**
 * Every catalogue object this observer can actually see right now: above the horizon, and bright
 * enough for how dark the sky currently is. Named for what it returns — `frameSync.placeSkyObjects`
 * is the separate step that turns these into GPU buffers.
 */
export function visibleSkyObjects(
	latDeg: number,
	lonDeg: number,
	date: Date | number,
	obscuration: number,
	sunAltDeg: number
): PlacedObject[] {
	const darkness = skyDarkness(obscuration, sunAltDeg);
	if (darkness <= 0) return [];
	const limit = limitingMag(darkness);

	const placed: PlacedObject[] = [];
	for (const object of SKY_OBJECTS) {
		// A generous pre-filter only; the real test is against the extinguished magnitude below.
		if (object.mag > limit) continue;
		const { alt, az } = horizonFor(object.ra, object.dec, latDeg, lonDeg, date);
		if (alt <= 0) continue;

		// Everything low down is seen through more air and more of the horizon's leftover glow, so it
		// arrives dimmer. Expressed as extinction in magnitudes rather than as an opacity multiplier,
		// which is what lets size and opacity fall out of the same number.
		//
		// 6°, not the 12° this started at: the objects worth seeing at THIS eclipse flank a Sun that is
		// itself only ~10° up — Jupiter at 5° and Mercury at 3° are the classic totality sight, and a fade
		// reaching to 12° dimmed exactly those until the frame held nothing worth looking at.
		const throughAir = Math.max(0.02, Math.min(1, alt / 6));
		const apparentMag = object.mag - 2.5 * Math.log10(throughAir);

		// How far this object clears the current threshold. As the sky darkens the threshold falls, so
		// headroom grows — objects brighten and swell instead of switching on at full size.
		const headroom = limit - apparentMag;
		if (headroom <= 0) continue;

		// Opacity ramps over FADE_MAGS magnitudes of headroom rather than snapping at the threshold, so
		// an object enters as a faint speck and firms up as totality deepens — compressed (RAMP_EXPONENT)
		// so the faint majority of the sky is actually seen, not technically present.
		const brightness = Math.min(1, Math.pow(headroom / FADE_MAGS, RAMP_EXPONENT));
		placed.push({ object, alt, az, headroom, brightness });
	}
	return placed.filter((p) => p.brightness > 0.02);
}
