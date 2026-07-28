// Shared eclipse math — validated against Espenak/NASA tables. Runs in Node (prerender) and browser.
import * as A from 'astronomy-engine';
import type { Vec3 } from '$lib/types';
import { ECLIPSE_DATE } from '$lib/config';
import { DEG_TO_RAD as D2R, RAD_TO_DEG as R2D, norm180, AU_KM, SUN_RADIUS_KM, EARTH_RADIUS_KM } from '$lib/constants';

export { ECLIPSE_DATE }; // re-exported for convenience; defined centrally in config.ts

export type GeoPoint = { lat: number; lon: number };
export type SunMoon = { sun: Vec3; moon: Vec3; sunAngR: number };

// WGS84 (specific to the ellipsoid intersection below)
const ER_A = 6378.137; // equatorial radius, km
const ER_F = 1 / 298.257223563; // flattening
const ER_B = ER_A * (1 - ER_F); // polar radius
const E2 = ER_F * (2 - ER_F); // eccentricity^2

/**
 * Ground point of the Moon's shadow axis at a given instant.
 * Returns {lat, lon} (geodetic degrees) or null if the axis misses Earth.
 * Validated against SearchGlobalSolarEclipse's greatest-eclipse point.
 */
export function shadowCenter(date: Date): GeoPoint | null {
	const time = A.MakeTime(date);
	// Apparent geocentric vectors (aberration on), EQJ, in AU. Aberration shifts the
	// Sun's apparent direction and therefore the shadow axis — validated to 0.0 km.
	const sunEqj = A.GeoVector(A.Body.Sun, time, true);
	const moonEqj = A.GeoVector(A.Body.Moon, time, true);
	const rot = A.Rotation_EQJ_EQD(time);
	const sun = A.RotateVector(rot, sunEqj);
	const moon = A.RotateVector(rot, moonEqj);
	const S = { x: sun.x * AU_KM, y: sun.y * AU_KM, z: sun.z * AU_KM };
	const M = { x: moon.x * AU_KM, y: moon.y * AU_KM, z: moon.z * AU_KM };
	let d = { x: M.x - S.x, y: M.y - S.y, z: M.z - S.z };
	const dl = Math.hypot(d.x, d.y, d.z);
	d = { x: d.x / dl, y: d.y / dl, z: d.z / dl };
	const ia2 = 1 / (ER_A * ER_A),
		ib2 = 1 / (ER_B * ER_B);
	const qa = d.x * d.x * ia2 + d.y * d.y * ia2 + d.z * d.z * ib2;
	const qb = 2 * (M.x * d.x * ia2 + M.y * d.y * ia2 + M.z * d.z * ib2);
	const qc = M.x * M.x * ia2 + M.y * M.y * ia2 + M.z * M.z * ib2 - 1;
	const disc = qb * qb - 4 * qa * qc;
	if (disc < 0) return null; // umbra axis misses Earth (partial-only region)
	const s = (-qb - Math.sqrt(disc)) / (2 * qa);
	const P = { x: M.x + s * d.x, y: M.y + s * d.y, z: M.z + s * d.z };
	const p = Math.hypot(P.x, P.y);
	const lat = Math.atan2(P.z, (1 - E2) * p) * R2D;
	const raDeg = Math.atan2(P.y, P.x) * R2D;
	const gastDeg = A.SiderealTime(time) * 15;
	const lon = norm180(raDeg - gastDeg);
	return { lat, lon };
}

/**
 * Sun & Moon in Earth-Centered Earth-Fixed (ECEF) coordinates, in units of Earth radii.
 * For the per-pixel shadow shader, whose surface point is
 * P = [cos(lat)cos(lon), cos(lat)sin(lon), sin(lat)] in the same frame.
 * Returns { sun: unit dir to Sun, moon: position (Earth radii), sunAngR: Sun angular radius (rad) }.
 */
export function sunMoonECEF(date: Date): SunMoon {
	const time = A.MakeTime(date);
	const rot = A.Rotation_EQJ_EQD(time);
	const g = A.SiderealTime(time) * 15 * D2R;
	const cg = Math.cos(g),
		sg = Math.sin(g);
	const toECEF = (v: A.Vector) => {
		const e = A.RotateVector(rot, v);
		return { x: e.x * cg + e.y * sg, y: -e.x * sg + e.y * cg, z: e.z };
	};
	const ER = EARTH_RADIUS_KM;
	const sunE = toECEF(A.GeoVector(A.Body.Sun, time, true));
	const moonE = toECEF(A.GeoVector(A.Body.Moon, time, true));
	const sunLen = Math.hypot(sunE.x, sunE.y, sunE.z);
	return {
		sun: [sunE.x / sunLen, sunE.y / sunLen, sunE.z / sunLen],
		moon: [(moonE.x * AU_KM) / ER, (moonE.y * AU_KM) / ER, (moonE.z * AU_KM) / ER],
		sunAngR: Math.asin(SUN_RADIUS_KM / (sunLen * AU_KM))
	};
}

/** Greatest-eclipse point + time (for validation and framing the globe). */
export function greatestEclipse() {
	const g = A.SearchGlobalSolarEclipse(A.MakeTime(new Date(ECLIPSE_DATE + 'T00:00:00Z')));
	return {
		kind: g.kind,
		obscuration: g.obscuration,
		date: g.peak.date,
		lat: g.latitude,
		lon: g.longitude
	};
}

/** Sun & Moon topocentric horizontal coords (az/alt, degrees) for an observer. */
export function sunMoonHorizon(lat: number, lon: number, date: Date, elevation = 0) {
	const time = A.MakeTime(date);
	const obs = new A.Observer(lat, lon, elevation);
	const out: Record<string, { az: number; alt: number; distAu: number }> = {};
	const bodies: [string, A.Body][] = [
		['sun', A.Body.Sun],
		['moon', A.Body.Moon]
	];
	for (const [key, body] of bodies) {
		const eq = A.Equator(body, time, obs, true, true);
		const h = A.Horizon(time, obs, eq.ra, eq.dec, 'normal');
		out[key] = { az: h.azimuth, alt: h.altitude, distAu: eq.dist };
	}
	return out;
}

export type LocalCircumstances = {
	kind: string;
	obscuration: number;
	partialBegin: { time: Date; alt: number } | null;
	totalBegin: { time: Date; alt: number } | null;
	peak: { time: Date; alt: number } | null;
	totalEnd: { time: Date; alt: number } | null;
	partialEnd: { time: Date; alt: number } | null;
};

/**
 * `SearchLocalSolarEclipse` scans FORWARD from its start time until it finds an eclipse the observer can
 * actually see. For anywhere the 2026 event misses, that is a *different eclipse* — Sydney gets 2028,
 * Tokyo 2030 — so the raw result cannot be shown as "your eclipse" without checking which one it is.
 */
function searchLocalEclipse(lat: number, lon: number, elevation: number): LocalCircumstances | null {
	const obs = new A.Observer(lat, lon, elevation);
	const start = A.MakeTime(new Date(ECLIPSE_DATE + 'T00:00:00Z'));
	let e: A.LocalSolarEclipseInfo;
	try {
		e = A.SearchLocalSolarEclipse(start, obs);
	} catch {
		return null;
	}
	const ev = (x: A.EclipseEvent | undefined) => (x ? { time: x.time.date, alt: x.altitude } : null);
	return {
		kind: e.kind,
		obscuration: e.obscuration,
		partialBegin: ev(e.partial_begin),
		totalBegin: ev(e.total_begin),
		peak: ev(e.peak),
		totalEnd: ev(e.total_end),
		partialEnd: ev(e.partial_end)
	};
}

// Greatest eclipse is a fixed instant; the search behind it costs a couple of ms, so resolve it once.
let greatestPeakMs: number | null = null;
const greatestPeak = () => (greatestPeakMs ??= greatestEclipse().date.getTime());

/**
 * A local peak is within ~2 h of greatest eclipse, and the nearest other solar eclipse is ~half a year
 * away — so a day is a wide margin that cannot confuse two events. Comparing against the instant rather
 * than the UTC date also holds if a future event's local peaks were to straddle midnight.
 */
const SAME_ECLIPSE_WINDOW_MS = 24 * 3600_000;

/**
 * Local circumstances of **the 2026 eclipse** for an observer: contact times, altitudes, obscuration.
 * `null` when this eclipse is not visible from there at all — see `nextEclipseHere` for what that
 * observer would see instead.
 */
export function localCircumstances(lat: number, lon: number, elevation = 0): LocalCircumstances | null {
	const found = searchLocalEclipse(lat, lon, elevation);
	if (!found?.peak) return null;
	// The guard that keeps a different eclipse from being presented as this one.
	if (Math.abs(found.peak.time.getTime() - greatestPeak()) > SAME_ECLIPSE_WINDOW_MS) return null;
	return found;
}

/**
 * Whether the 2026 eclipse can actually be WATCHED from a place: it reaches it (non-null local
 * circumstances), the Sun is up at maximum, and at least a rounded 1 % of the disc is covered. This is
 * the app's one definition of "visible from here" — the B1 verdict card's headline and the page's
 * decision to show or drop the B3 sky view both read it, so they cannot disagree.
 *
 * The Sun-up test is the peak's altitude, same as the verdict copy ("at maximum the Sun is below the
 * horizon"): a place like Rome, where a deep partial phase runs into sunset but the maximum itself falls
 * after it, counts as not visible.
 */
export function eclipseVisible(lc: LocalCircumstances | null): boolean {
	return !!lc?.peak && lc.peak.alt > 0 && Math.round(lc.obscuration * 100) > 0;
}

/**
 * The next solar eclipse visible from this location at or after eclipse day — which for anywhere on the
 * 2026 path is the 2026 event itself, and elsewhere is a later one. Read `peak.time` for the date; it is
 * the only function here that may return an eclipse other than 2026, and callers must say which they mean.
 */
export function nextEclipseHere(lat: number, lon: number, elevation = 0): LocalCircumstances | null {
	return searchLocalEclipse(lat, lon, elevation);
}

/** Local sunset instant on eclipse day for an observer, or null if the Sun doesn't set that day. */
export function sunset(lat: number, lon: number, elevation = 0): Date | null {
	const obs = new A.Observer(lat, lon, elevation);
	const start = A.MakeTime(new Date(ECLIPSE_DATE + 'T00:00:00Z'));
	const set = A.SearchRiseSet(A.Body.Sun, obs, -1, start, 1); // direction -1 = set
	return set ? set.date : null;
}
