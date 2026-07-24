// Obscuration field for the A2 shadow globe.
//
// "Obscuration" = the fraction of the Sun's disc the Moon covers, as seen from a ground
// point (0 = uneclipsed, 1 = totality). Sampling it on a lat/lon grid for one instant and
// tracing iso-lines through that grid gives the live "50/75/100 %" rings that outline the
// Moon's shadow and move with the timeline. Pure math — no browser/WebGL dependency.

const DEG_TO_RAD = Math.PI / 180;

// Moon radius expressed in Earth radii, the unit the shadow shader also works in. The Moon's
// angular radius from a ground point is this divided by the point-to-Moon distance.
const MOON_RADIUS_IN_EARTH_RADII = 0.27271;

// A location only sees the eclipse while the Sun is above its horizon. Rather than a hard cut
// at the terminator (which slices the rings into jagged edges), fade obscuration out smoothly
// across a thin twilight band, expressed as sin(solar elevation) = dot(point, sunDir).
const TWILIGHT_FADE_START = -0.03; // fully faded just below the horizon
const TWILIGHT_FADE_END = 0.08;    // fully visible a little above it

/** An empty ring geometry, for initialising a MapLibre source before the first frame. */
export const EMPTY_LINES = { type: 'Feature', geometry: { type: 'MultiLineString', coordinates: [] } };

const clamp = (x, lo, hi) => (x < lo ? lo : x > hi ? hi : x);

function degreeRange(start, end, step) {
  const values = [];
  for (let v = start; v <= end + 1e-9; v += step) values.push(v);
  return values;
}

/**
 * Fraction of the Sun's disc hidden by the Moon's disc, from their angular radii and the
 * angular separation of their centres (the classic two-circle "lens" overlap).
 * @param {number} sunRadius   Sun's angular radius (rad)
 * @param {number} moonRadius  Moon's angular radius (rad)
 * @param {number} separation  angular distance between the two centres (rad)
 * @returns {number} 0..1
 */
export function discOverlapFraction(sunRadius, moonRadius, separation) {
  if (separation >= sunRadius + moonRadius) return 0;                    // discs fully apart
  if (separation <= Math.abs(moonRadius - sunRadius)) {                  // one disc inside the other
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

/**
 * A fixed lat/lon grid over which obscuration is re-sampled every frame, plus marching-squares
 * contour extraction. The grid spans the whole penumbra; 0.7° resolution is fine enough to
 * catch even the small central umbra.
 */
export class ObscurationField {
  constructor({ latRange = [12, 90], lonRange = [-150, 90], stepDeg = 0.7 } = {}) {
    this.latitudes = degreeRange(latRange[0], latRange[1], stepDeg);
    this.longitudes = degreeRange(lonRange[0], lonRange[1], stepDeg);
    this.rows = this.latitudes.length;
    this.cols = this.longitudes.length;

    // Pre-split the per-row / per-column trig so the hot sampling loop stays cheap.
    this._cosLat = this.latitudes.map((d) => Math.cos(d * DEG_TO_RAD));
    this._sinLat = this.latitudes.map((d) => Math.sin(d * DEG_TO_RAD));
    this._cosLon = this.longitudes.map((d) => Math.cos(d * DEG_TO_RAD));
    this._sinLon = this.longitudes.map((d) => Math.sin(d * DEG_TO_RAD));

    // Reused each frame; coverage[row * cols + col].
    this.coverage = new Float32Array(this.rows * this.cols);
  }

  /**
   * Re-fill the grid with obscuration for one instant.
   * @param {{ sun: number[], moon: number[], sunAngR: number }} sunMoon
   *   Sun/Moon in the Earth-fixed frame (from eclipse.js `sunMoonECEF`): `sun` = unit direction,
   *   `moon` = position in Earth radii, `sunAngR` = Sun's angular radius (rad).
   */
  sample(sunMoon) {
    const [sunX, sunY, sunZ] = sunMoon.sun;
    const [moonX, moonY, moonZ] = sunMoon.moon;
    const sunRadius = sunMoon.sunAngR;
    const coverage = this.coverage;

    for (let row = 0; row < this.rows; row++) {
      const cosLat = this._cosLat[row], sinLat = this._sinLat[row], rowOffset = row * this.cols;
      for (let col = 0; col < this.cols; col++) {
        // Ground point as a unit vector in the Earth-fixed frame.
        const px = cosLat * this._cosLon[col];
        const py = cosLat * this._sinLon[col];
        const pz = sinLat;

        const sinElevation = px * sunX + py * sunY + pz * sunZ;
        const dayFactor = clamp((sinElevation - TWILIGHT_FADE_START) / (TWILIGHT_FADE_END - TWILIGHT_FADE_START), 0, 1);
        if (dayFactor <= 0) { coverage[rowOffset + col] = 0; continue; } // Sun below horizon → not seen

        const toMoonX = moonX - px, toMoonY = moonY - py, toMoonZ = moonZ - pz;
        const distToMoon = Math.sqrt(toMoonX * toMoonX + toMoonY * toMoonY + toMoonZ * toMoonZ);
        const cosSeparation = clamp((sunX * toMoonX + sunY * toMoonY + sunZ * toMoonZ) / distToMoon, -1, 1);
        const separation = Math.acos(cosSeparation);
        const moonRadius = MOON_RADIUS_IN_EARTH_RADII / distToMoon;

        coverage[rowOffset + col] = discOverlapFraction(sunRadius, moonRadius, separation) * dayFactor;
      }
    }
  }

  /**
   * Marching-squares iso-line at a coverage `level` (0..1), from the last `sample()`.
   * @returns GeoJSON Feature (MultiLineString) — ready for a MapLibre geojson source.
   */
  contour(level) {
    const { latitudes, longitudes, coverage, cols } = this;
    const segments = [];

    // Linear crossing point where the iso-line cuts a cell edge between two corners.
    const crossing = (valueA, valueB, cornerA, cornerB) => {
      const t = (level - valueA) / (valueB - valueA);
      return [cornerA[0] + (cornerB[0] - cornerA[0]) * t, cornerA[1] + (cornerB[1] - cornerA[1]) * t];
    };

    for (let row = 0; row < this.rows - 1; row++) {
      const latTop = latitudes[row], latBottom = latitudes[row + 1];
      const rowTop = row * cols, rowBottom = rowTop + cols;
      for (let col = 0; col < cols - 1; col++) {
        const lonLeft = longitudes[col], lonRight = longitudes[col + 1];
        const topLeft = coverage[rowTop + col], topRight = coverage[rowTop + col + 1];
        const bottomRight = coverage[rowBottom + col + 1], bottomLeft = coverage[rowBottom + col];

        // Where the level crosses each of the four cell edges.
        const crossings = [];
        if ((topLeft > level) !== (topRight > level)) crossings.push(crossing(topLeft, topRight, [lonLeft, latTop], [lonRight, latTop]));
        if ((topRight > level) !== (bottomRight > level)) crossings.push(crossing(topRight, bottomRight, [lonRight, latTop], [lonRight, latBottom]));
        if ((bottomRight > level) !== (bottomLeft > level)) crossings.push(crossing(bottomRight, bottomLeft, [lonRight, latBottom], [lonLeft, latBottom]));
        if ((bottomLeft > level) !== (topLeft > level)) crossings.push(crossing(bottomLeft, topLeft, [lonLeft, latBottom], [lonLeft, latTop]));

        if (crossings.length === 2) segments.push([crossings[0], crossings[1]]);
        else if (crossings.length === 4) { segments.push([crossings[0], crossings[1]]); segments.push([crossings[2], crossings[3]]); } // ambiguous saddle
      }
    }

    return { type: 'Feature', geometry: { type: 'MultiLineString', coordinates: segments } };
  }
}
