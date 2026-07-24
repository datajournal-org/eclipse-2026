// Shadow model for one instant: the shadow axis + a 1D brightness profile.
//
// "Obscuration" = the fraction of the Sun's disc the Moon covers, as seen from a ground point.
// Because the shadow is rotationally symmetric, it depends only on the perpendicular distance `r`
// from a ground point to the shadow axis (the line through the Moon and the shadow centre). Moving
// `r` off-axis rotates the Moon's apparent position against the Sun by the parallax σ ≈ r / d_moon,
// so  coverage(r) = discOverlap(sunAngR, moonAngR, r / d_moon). That 1D profile drives both the
// shader (as a lookup texture) and the iso-rings (see isoRing.ts). Pure math — no browser/WebGL.

import type { Vec3 } from '$lib/types';
import type { GeoPoint, SunMoon } from '$lib/eclipse';

const MOON_RADIUS_IN_EARTH_RADII = 0.27271;

/** Number of samples in the brightness profile / LUT texture width. */
export const PROFILE_SIZE = 256;

export type ShadowModel = {
	/** Shadow centre on the unit sphere (ECEF unit vector). */
	center: Vec3;
	/** Unit shadow-axis direction (centre → Moon). */
	axis: Vec3;
	/** Unit direction to the Sun. */
	sunDir: Vec3;
	/** Penumbra radius in Earth radii (coverage → 0); the LUT is sampled over [0, rMax]. */
	rMax: number;
	/** coverage(r) samples, 0..1 (used to invert level → radius). */
	coverage: Float32Array;
	/** The same profile as an 8-bit R-channel LUT for the texture. */
	profileBytes: Uint8Array;
};

/**
 * Fraction of the Sun's disc hidden by the Moon's disc (two-circle "lens" overlap), 0..1.
 * @param sunRadius   Sun's angular radius (rad)
 * @param moonRadius  Moon's angular radius (rad)
 * @param separation  angular distance between the disc centres (rad)
 */
export function discOverlapFraction(sunRadius: number, moonRadius: number, separation: number): number {
	if (separation >= sunRadius + moonRadius) return 0;
	if (separation <= Math.abs(moonRadius - sunRadius)) {
		return moonRadius >= sunRadius ? 1 : (moonRadius * moonRadius) / (sunRadius * sunRadius);
	}
	const cosAtSun = clamp(
		(separation * separation + sunRadius * sunRadius - moonRadius * moonRadius) / (2 * separation * sunRadius),
		-1,
		1
	);
	const cosAtMoon = clamp(
		(separation * separation + moonRadius * moonRadius - sunRadius * sunRadius) / (2 * separation * moonRadius),
		-1,
		1
	);
	const lensArea =
		sunRadius * sunRadius * Math.acos(cosAtSun) +
		moonRadius * moonRadius * Math.acos(cosAtMoon) -
		0.5 *
			Math.sqrt(
				Math.max(
					0,
					(-separation + sunRadius + moonRadius) *
						(separation + sunRadius - moonRadius) *
						(separation - sunRadius + moonRadius) *
						(separation + sunRadius + moonRadius)
				)
			);
	return lensArea / (Math.PI * sunRadius * sunRadius);
}

/** Geodetic lat/lon (deg) → unit vector in the Earth-fixed frame used by the shader. */
export function latLonToUnitVector(latDeg: number, lonDeg: number): Vec3 {
	const lat = latDeg * (Math.PI / 180),
		lon = lonDeg * (Math.PI / 180);
	const cosLat = Math.cos(lat);
	return [cosLat * Math.cos(lon), cosLat * Math.sin(lon), Math.sin(lat)];
}

/**
 * Build the shadow axis + brightness profile for one instant.
 * @param center   shadow centre (from `shadowCenter`)
 * @param sunMoon  from `sunMoonECEF`
 */
export function computeShadowModel(center: GeoPoint, sunMoon: SunMoon): ShadowModel {
	const C = latLonToUnitVector(center.lat, center.lon);
	const [mx, my, mz] = sunMoon.moon;
	const axisX = mx - C[0],
		axisY = my - C[1],
		axisZ = mz - C[2];
	const distToMoon = Math.hypot(axisX, axisY, axisZ);
	const axis: Vec3 = [axisX / distToMoon, axisY / distToMoon, axisZ / distToMoon];

	const sunAngR = sunMoon.sunAngR;
	const moonAngR = MOON_RADIUS_IN_EARTH_RADII / distToMoon;
	const rMax = distToMoon * (sunAngR + moonAngR); // off-axis distance where the penumbra ends

	const coverage = new Float32Array(PROFILE_SIZE);
	const profileBytes = new Uint8Array(PROFILE_SIZE);
	for (let i = 0; i < PROFILE_SIZE; i++) {
		const r = (i / (PROFILE_SIZE - 1)) * rMax;
		const cov = discOverlapFraction(sunAngR, moonAngR, r / distToMoon);
		coverage[i] = cov;
		profileBytes[i] = Math.round(cov * 255);
	}

	return { center: C, axis, sunDir: sunMoon.sun, rMax, coverage, profileBytes };
}

/**
 * Invert the profile: the off-axis radius (Earth radii) at which coverage equals `level`, or null
 * if the eclipse never reaches that coverage (e.g. a 100 % ring for a non-total moment). Coverage
 * decreases monotonically with r, so a single linear scan suffices.
 */
export function radiusForCoverage(model: ShadowModel, level: number): number | null {
	const { coverage, rMax } = model;
	const n = coverage.length;
	if (coverage[0] < level) return null;
	for (let i = 1; i < n; i++) {
		if (coverage[i] <= level) {
			const high = coverage[i - 1],
				low = coverage[i];
			const t = high === low ? 0 : (high - level) / (high - low);
			return ((i - 1 + t) / (n - 1)) * rMax;
		}
	}
	return rMax;
}

function clamp(x: number, lo: number, hi: number): number {
	return x < lo ? lo : x > hi ? hi : x;
}
