// Shared eclipse math — validated against Espenak/NASA tables. Runs in Node (prerender) and browser.
import * as A from 'astronomy-engine';
import type { Vec3 } from '$lib/types';
import { ECLIPSE_DATE } from '$lib/config';

export { ECLIPSE_DATE }; // re-exported for convenience; defined centrally in config.ts

export type GeoPoint = { lat: number; lon: number };
export type SunMoon = { sun: Vec3; moon: Vec3; sunAngR: number };

const AU_KM = 149597870.7;
// WGS84
const ER_A = 6378.137; // equatorial radius, km
const ER_F = 1 / 298.257223563; // flattening
const ER_B = ER_A * (1 - ER_F); // polar radius
const E2 = ER_F * (2 - ER_F); // eccentricity^2

const D2R = Math.PI / 180,
	R2D = 180 / Math.PI;
const norm180 = (d: number) => ((d + 540) % 360) - 180;

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
	const ER = 6371;
	const sunE = toECEF(A.GeoVector(A.Body.Sun, time, true));
	const moonE = toECEF(A.GeoVector(A.Body.Moon, time, true));
	const sunLen = Math.hypot(sunE.x, sunE.y, sunE.z);
	return {
		sun: [sunE.x / sunLen, sunE.y / sunLen, sunE.z / sunLen],
		moon: [(moonE.x * AU_KM) / ER, (moonE.y * AU_KM) / ER, (moonE.z * AU_KM) / ER],
		sunAngR: Math.asin(696000 / (sunLen * AU_KM))
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

/** Local circumstances: contact times, altitudes, obscuration for an observer. */
export function localCircumstances(lat: number, lon: number, elevation = 0) {
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

/** Local sunset instant on eclipse day for an observer, or null if the Sun doesn't set that day. */
export function sunset(lat: number, lon: number, elevation = 0): Date | null {
	const obs = new A.Observer(lat, lon, elevation);
	const start = A.MakeTime(new Date(ECLIPSE_DATE + 'T00:00:00Z'));
	const set = A.SearchRiseSet(A.Body.Sun, obs, -1, start, 1); // direction -1 = set
	return set ? set.date : null;
}
