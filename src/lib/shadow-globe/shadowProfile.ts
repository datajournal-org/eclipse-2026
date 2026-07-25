// Shadow model for one instant: the shadow axis + a 1D brightness profile.
//
// "Obscuration" = the fraction of the Sun's disc the Moon covers, as seen from a ground point.
// Because the shadow is rotationally symmetric, it depends only on the perpendicular distance `r`
// from a ground point to the shadow axis (the line through the Moon and the shadow centre). Moving
// `r` off-axis rotates the Moon's apparent position against the Sun by the parallax σ ≈ r / d_moon,
// so  coverage(r) = discOverlap(sunAngR, moonAngR, r / d_moon). That 1D profile drives both the
// shader (as a lookup texture) and the iso-rings (see isoRing.ts). Pure math — no browser/WebGL.

import type { Vec3 } from '$lib/types';
import type { SunMoon } from '$lib/eclipse';
import { clamp } from './vec3';
import { SUN_RADIUS_KM, EARTH_RADIUS_KM } from '$lib/constants';

const MOON_RADIUS_IN_EARTH_RADII = 0.27271;

/** Number of samples in the coverage profile / LUT texture width. */
export const PROFILE_SIZE = 512;

export type ShadowModel = {
	/** A point on the shadow axis: the perpendicular foot from Earth's centre (⊥ to `axis`). */
	center: Vec3;
	/** Unit shadow-axis direction (Moon → Sun, i.e. sunward). */
	axis: Vec3;
	/** Unit direction to the Sun. */
	sunDir: Vec3;
	/** Penumbra radius in Earth radii (coverage → 0); the LUT is sampled over [0, rMax]. */
	rMax: number;
	/** coverage(r) samples, 0..1 — used both to invert level → radius and as the shader LUT (uploaded
	 *  as a float texture, so the penumbra gradient stays smooth, no 8-bit stepping). */
	coverage: Float32Array;
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

/**
 * Build the shadow axis + brightness profile for one instant. Uses only the Sun/Moon geometry, so
 * it's defined whether or not the umbra reaches Earth (unlike anchoring on the surface intersection).
 * @param sunMoon  from `sunMoonECEF`
 */
export function computeShadowModel(sunMoon: SunMoon): ShadowModel {
	const [mx, my, mz] = sunMoon.moon;
	const sunDir = sunMoon.sun;
	const sunAngR = sunMoon.sunAngR;

	// Exact shadow axis = the Moon→Sun line. Sun distance is recovered from its angular radius.
	const sunDistEr = SUN_RADIUS_KM / Math.sin(sunAngR) / EARTH_RADIUS_KM;
	const ax = sunDir[0] * sunDistEr - mx,
		ay = sunDir[1] * sunDistEr - my,
		az = sunDir[2] * sunDistEr - mz;
	const axisLen = Math.hypot(ax, ay, az);
	const axis: Vec3 = [ax / axisLen, ay / axisLen, az / axisLen];

	// Anchor: the foot of the perpendicular from Earth's centre onto the axis (a point ON the axis,
	// ⊥ to it). Always defined; the perpendicular-distance coordinate is independent of which axis
	// point is used, so the shader/rings behave the same when the umbra does reach Earth.
	const mDotAxis = mx * axis[0] + my * axis[1] + mz * axis[2];
	const center: Vec3 = [mx - mDotAxis * axis[0], my - mDotAxis * axis[1], mz - mDotAxis * axis[2]];

	const distToMoon = Math.hypot(mx, my, mz);
	const moonAngR = MOON_RADIUS_IN_EARTH_RADII / distToMoon;
	const rMax = distToMoon * (sunAngR + moonAngR); // off-axis distance where the penumbra ends

	const coverage = new Float32Array(PROFILE_SIZE);
	for (let i = 0; i < PROFILE_SIZE; i++) {
		const r = (i / (PROFILE_SIZE - 1)) * rMax;
		coverage[i] = discOverlapFraction(sunAngR, moonAngR, r / distToMoon);
	}

	return { center, axis, sunDir, rMax, coverage };
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
