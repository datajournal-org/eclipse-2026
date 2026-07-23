// Shared eclipse math — runs in Node (validation) and the browser (prototypes).
// The import specifier 'astronomy-engine' is resolved by an import map in the HTML.
import * as A from 'astronomy-engine';

export const ECLIPSE_DATE = '2026-08-12';
const AU_KM = 149597870.7;
// WGS84
const ER_A = 6378.137;              // equatorial radius, km
const ER_F = 1 / 298.257223563;     // flattening
const ER_B = ER_A * (1 - ER_F);     // polar radius
const E2 = ER_F * (2 - ER_F);       // eccentricity^2

const D2R = Math.PI / 180, R2D = 180 / Math.PI;
const norm180 = (d) => ((d + 540) % 360) - 180;

/**
 * Ground point of the Moon's shadow axis at a given instant.
 * Returns {lat, lon} (geodetic degrees) or null if the axis misses Earth.
 * Validated against SearchGlobalSolarEclipse's greatest-eclipse point.
 */
export function shadowCenter(date) {
  const time = A.MakeTime(date);
  // Apparent geocentric vectors (aberration on), EQJ, in AU. Aberration shifts the
  // Sun's apparent direction and therefore the shadow axis — validated to 0.0 km
  // against SearchGlobalSolarEclipse's greatest-eclipse point.
  const sunEqj = A.GeoVector(A.Body.Sun, time, true);
  const moonEqj = A.GeoVector(A.Body.Moon, time, true);
  // Rotate to equator-of-date so the ellipsoid is axis-aligned with z = pole.
  const rot = A.Rotation_EQJ_EQD(time);
  const sun = A.RotateVector(rot, sunEqj);
  const moon = A.RotateVector(rot, moonEqj);
  // km
  const S = { x: sun.x * AU_KM, y: sun.y * AU_KM, z: sun.z * AU_KM };
  const M = { x: moon.x * AU_KM, y: moon.y * AU_KM, z: moon.z * AU_KM };
  // Direction Sun -> Moon (shadow travels this way onto Earth).
  let d = { x: M.x - S.x, y: M.y - S.y, z: M.z - S.z };
  const dl = Math.hypot(d.x, d.y, d.z);
  d = { x: d.x / dl, y: d.y / dl, z: d.z / dl };
  // Ray P = M + s*d, intersect ellipsoid x^2/a^2 + y^2/a^2 + z^2/b^2 = 1.
  const ia2 = 1 / (ER_A * ER_A), ib2 = 1 / (ER_B * ER_B);
  const qa = d.x * d.x * ia2 + d.y * d.y * ia2 + d.z * d.z * ib2;
  const qb = 2 * (M.x * d.x * ia2 + M.y * d.y * ia2 + M.z * d.z * ib2);
  const qc = M.x * M.x * ia2 + M.y * M.y * ia2 + M.z * M.z * ib2 - 1;
  const disc = qb * qb - 4 * qa * qc;
  if (disc < 0) return null; // umbra axis misses Earth (partial-only region)
  const s = (-qb - Math.sqrt(disc)) / (2 * qa); // near-side root
  const P = { x: M.x + s * d.x, y: M.y + s * d.y, z: M.z + s * d.z };
  // Geodetic latitude from ellipsoid-surface point.
  const p = Math.hypot(P.x, P.y);
  const lat = Math.atan2(P.z, (1 - E2) * p) * R2D;
  // Longitude from right ascension minus Greenwich apparent sidereal time.
  const raDeg = Math.atan2(P.y, P.x) * R2D;
  const gastDeg = A.SiderealTime(time) * 15;
  const lon = norm180(raDeg - gastDeg);
  return { lat, lon };
}

/** Greatest-eclipse point + time (for validation and framing the globe). */
export function greatestEclipse() {
  const g = A.SearchGlobalSolarEclipse(A.MakeTime(new Date(ECLIPSE_DATE + 'T00:00:00Z')));
  return {
    kind: g.kind, obscuration: g.obscuration,
    date: g.peak.date, lat: g.latitude, lon: g.longitude,
  };
}

/** Sun & Moon topocentric horizontal coords (az/alt, degrees) for an observer. */
export function sunMoonHorizon(lat, lon, date, elevation = 0) {
  const time = A.MakeTime(date);
  const obs = new A.Observer(lat, lon, elevation);
  const out = {};
  for (const [key, body] of [['sun', A.Body.Sun], ['moon', A.Body.Moon]]) {
    const eq = A.Equator(body, time, obs, true, true); // ofdate, aberration
    const h = A.Horizon(time, obs, eq.ra, eq.dec, 'normal');
    out[key] = { az: h.azimuth, alt: h.altitude, distAu: eq.dist };
  }
  return out;
}

/** Local circumstances: contact times, altitudes, obscuration for an observer. */
export function localCircumstances(lat, lon, elevation = 0) {
  const obs = new A.Observer(lat, lon, elevation);
  const start = A.MakeTime(new Date(ECLIPSE_DATE + 'T00:00:00Z'));
  let e;
  try { e = A.SearchLocalSolarEclipse(start, obs); }
  catch { return null; }
  const ev = (x) => x ? { time: x.time.date, alt: x.altitude } : null;
  return {
    kind: e.kind,
    obscuration: e.obscuration,
    partialBegin: ev(e.partial_begin),
    totalBegin: ev(e.total_begin),
    peak: ev(e.peak),
    totalEnd: ev(e.total_end),
    partialEnd: ev(e.partial_end),
  };
}
