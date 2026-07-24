// Shadow model for one instant: the shadow axis + a 1D brightness profile.
//
// Instead of evaluating the Sun/Moon disc overlap per pixel, we exploit the shadow's rotational
// symmetry: obscuration depends only on the perpendicular distance `r` from a ground point to the
// shadow axis (the line through the Moon and the shadow centre). Moving `r` off-axis rotates the
// Moon's apparent position against the Sun by the parallax σ ≈ r / d_moon, so
//     coverage(r) = discOverlap(sunAngR, moonAngR, r / d_moon).
// That 1D profile drives both the shader (as a lookup texture) and the iso-rings (see isoRing.js).

const MOON_RADIUS_IN_EARTH_RADII = 0.27271;

/** Number of samples in the brightness profile / LUT texture width. */
export const PROFILE_SIZE = 256;

/**
 * Fraction of the Sun's disc hidden by the Moon's disc (two-circle "lens" overlap), 0..1.
 * @param {number} sunRadius   Sun's angular radius (rad)
 * @param {number} moonRadius  Moon's angular radius (rad)
 * @param {number} separation  angular distance between the disc centres (rad)
 */
export function discOverlapFraction(sunRadius, moonRadius, separation) {
  if (separation >= sunRadius + moonRadius) return 0;
  if (separation <= Math.abs(moonRadius - sunRadius)) {
    return moonRadius >= sunRadius ? 1 : (moonRadius * moonRadius) / (sunRadius * sunRadius);
  }
  const cosAtSun = clamp((separation * separation + sunRadius * sunRadius - moonRadius * moonRadius) / (2 * separation * sunRadius), -1, 1);
  const cosAtMoon = clamp((separation * separation + moonRadius * moonRadius - sunRadius * sunRadius) / (2 * separation * moonRadius), -1, 1);
  const lensArea =
    sunRadius * sunRadius * Math.acos(cosAtSun) +
    moonRadius * moonRadius * Math.acos(cosAtMoon) -
    0.5 * Math.sqrt(Math.max(0,
      (-separation + sunRadius + moonRadius) *
      (separation + sunRadius - moonRadius) *
      (separation - sunRadius + moonRadius) *
      (separation + sunRadius + moonRadius)));
  return lensArea / (Math.PI * sunRadius * sunRadius);
}

/** Geodetic lat/lon (deg) → unit vector in the Earth-fixed frame used by the shader. */
export function latLonToUnitVector(latDeg, lonDeg) {
  const lat = latDeg * (Math.PI / 180), lon = lonDeg * (Math.PI / 180);
  const cosLat = Math.cos(lat);
  return [cosLat * Math.cos(lon), cosLat * Math.sin(lon), Math.sin(lat)];
}

/**
 * @typedef {Object} ShadowModel
 * @property {number[]} center   shadow centre on the unit sphere (ECEF unit vector)
 * @property {number[]} axis     unit shadow-axis direction (centre → Moon)
 * @property {number[]} sunDir   unit direction to the Sun
 * @property {number}   rMax     penumbra radius in Earth radii (coverage → 0); LUT is sampled over [0, rMax]
 * @property {Float32Array} coverage      coverage(r) samples, 0..1 (used to invert level → radius)
 * @property {Uint8Array}   profileBytes  the same profile as an 8-bit R-channel LUT for the texture
 */

/**
 * Build the shadow axis + brightness profile for one instant.
 * @param {{lat:number, lon:number}} center  shadow centre (from `shadowCenter`)
 * @param {{sun:number[], moon:number[], sunAngR:number}} sunMoon  from `sunMoonECEF`
 * @returns {ShadowModel}
 */
export function computeShadowModel(center, sunMoon) {
  const C = latLonToUnitVector(center.lat, center.lon);
  const [mx, my, mz] = sunMoon.moon;
  const axisX = mx - C[0], axisY = my - C[1], axisZ = mz - C[2];
  const distToMoon = Math.hypot(axisX, axisY, axisZ);
  const axis = [axisX / distToMoon, axisY / distToMoon, axisZ / distToMoon];

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
export function radiusForCoverage(model, level) {
  const { coverage, rMax } = model;
  const n = coverage.length;
  if (coverage[0] < level) return null;
  for (let i = 1; i < n; i++) {
    if (coverage[i] <= level) {
      const high = coverage[i - 1], low = coverage[i];
      const t = high === low ? 0 : (high - level) / (high - low);
      return ((i - 1 + t) / (n - 1)) * rMax;
    }
  }
  return rMax;
}

function clamp(x, lo, hi) { return x < lo ? lo : x > hi ? hi : x; }
