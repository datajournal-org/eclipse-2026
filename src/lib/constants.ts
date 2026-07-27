// Shared numeric constants — angle conversion + wrap, and the physical radii/distances used across
// the astronomy math (eclipse.ts) and the shadow geometry (vec3, shadowProfile, the WebGL layers).
// Kept deliberately dependency-free so light consumers don't pull in astronomy-engine.

/** Degrees → radians. */
export const DEG_TO_RAD = Math.PI / 180;
/** Radians → degrees. */
export const RAD_TO_DEG = 180 / Math.PI;

/**
 * Normalise an angle in degrees to [-180, 180).
 * The inner `% 360` is what makes this total: JS's `%` keeps the sign of the dividend, so a single
 * `(deg + 540) % 360` returns out-of-range values for inputs below -540°.
 */
export const norm180 = (deg: number): number => (((deg % 360) + 540) % 360) - 180;

/** Astronomical unit, in kilometres. */
export const AU_KM = 149597870.7;

/** Physical radii, in kilometres. */
export const SUN_RADIUS_KM = 696000;
export const MOON_RADIUS_KM = 1737.4;
export const EARTH_RADIUS_KM = 6371;

/** Earth radius in metres (ground-distance / curvature math). */
export const EARTH_RADIUS_M = EARTH_RADIUS_KM * 1000;
