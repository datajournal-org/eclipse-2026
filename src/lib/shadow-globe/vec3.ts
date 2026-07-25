// Small shared 3-vector + geographic helpers used across the shadow-globe geometry modules — kept in
// one place so isoRing / corridorCompute / shadowProfile don't each carry their own copy.
import type { Vec3 } from '$lib/types';

const RAD_TO_DEG = 180 / Math.PI;
const DEG_TO_RAD = Math.PI / 180;

export function dot(a: Vec3, b: Vec3): number {
	return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}
export function cross(a: Vec3, b: Vec3): Vec3 {
	return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}
export function length(a: Vec3): number {
	return Math.hypot(a[0], a[1], a[2]);
}
export function normalize(a: Vec3): Vec3 {
	const l = length(a) || 1;
	return [a[0] / l, a[1] / l, a[2] / l];
}
export function sub(a: Vec3, b: Vec3): Vec3 {
	return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}
export function negate(a: Vec3): Vec3 {
	return [-a[0], -a[1], -a[2]];
}
export function lerp(a: Vec3, b: Vec3, f: number): Vec3 {
	return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];
}
/** Geodesic offset of unit `c` by angle `rho` toward unit `dir` (dir ⊥ c). */
export function offset(c: Vec3, dir: Vec3, rho: number): Vec3 {
	const co = Math.cos(rho),
		si = Math.sin(rho);
	return [c[0] * co + dir[0] * si, c[1] * co + dir[1] * si, c[2] * co + dir[2] * si];
}
export function clamp(x: number, lo: number, hi: number): number {
	return x < lo ? lo : x > hi ? hi : x;
}

// --- geographic ---

/** Unit vector on the Earth-fixed sphere → [lon, lat] in degrees. */
export function toLonLat(v: Vec3): [number, number] {
	return [Math.atan2(v[1], v[0]) * RAD_TO_DEG, Math.asin(clamp(v[2], -1, 1)) * RAD_TO_DEG];
}
/** Geodetic lat/lon (deg) → unit vector in the Earth-fixed frame used by the shader/rings. */
export function latLonToUnitVector(latDeg: number, lonDeg: number): Vec3 {
	const lat = latDeg * DEG_TO_RAD,
		lon = lonDeg * DEG_TO_RAD;
	const cosLat = Math.cos(lat);
	return [cosLat * Math.cos(lon), cosLat * Math.sin(lon), Math.sin(lat)];
}
/** Great-circle destination [lon, lat] (deg) from (lat, lon) going `distM` metres along `bearingDeg`. */
export function destPoint(lat: number, lon: number, bearingDeg: number, distM: number): [number, number] {
	const R = 6371000,
		d = distM / R,
		br = bearingDeg * DEG_TO_RAD,
		la = lat * DEG_TO_RAD,
		lo = lon * DEG_TO_RAD;
	const la2 = Math.asin(Math.sin(la) * Math.cos(d) + Math.cos(la) * Math.sin(d) * Math.cos(br));
	const lo2 = lo + Math.atan2(Math.sin(br) * Math.sin(d) * Math.cos(la), Math.cos(d) - Math.sin(la) * Math.sin(la2));
	return [lo2 * RAD_TO_DEG, la2 * RAD_TO_DEG];
}
