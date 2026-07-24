// Iso-coverage rings = intersection of a cylinder (radius X around the shadow axis) with the unit
// sphere, restricted to the sunlit hemisphere. Smooth, analytic, high-resolution — no marching
// squares. See shadowProfile.js for how X is picked from a coverage level.
//
// With an orthonormal basis {u, v, axis} where u is the axis-perpendicular part of the centre C,
// the cylinder point C + X·(cosθ·u + sinθ·v) + s·axis lies on the unit sphere when
//     s = −k + √(k² − X² − 2·X·a·cosθ),   k = C·axis,  a = |C − (C·axis)·axis|.
// We take the +√ (sunward) root and keep only the day side.
//
// A ring is open where it runs off the Earth's limb (discriminant < 0, the cylinder is tangent to
// the sphere) or crosses into night (P·sunDir ≤ 0). To keep the open ends from flickering during
// the animation, each end is anchored on the *exact* boundary angle (found by bisection) instead of
// the last sampled point — so the endpoints move continuously frame to frame.

/** Empty ring geometry, for initialising a MapLibre source before the first frame. */
export const EMPTY_LINES = { type: 'Feature', geometry: { type: 'MultiLineString', coordinates: [] } };

const TAU = 2 * Math.PI;
const RAD_TO_DEG = 180 / Math.PI;

/**
 * @param {import('./shadowProfile').ShadowModel} model
 * @param {number} radius  cylinder radius X (Earth radii) for the chosen coverage level
 * @param {number} [steps] angular samples around the ring
 * @returns GeoJSON Feature (MultiLineString) in [lon, lat]
 */
export function isoRing(model, radius, steps = 512) {
  const C = model.center, axis = model.axis, sunDir = model.sunDir;
  const k = dot(C, axis);
  const cPerp = [C[0] - k * axis[0], C[1] - k * axis[1], C[2] - k * axis[2]];
  const a = length(cPerp);

  // Basis perpendicular to the axis. When the Sun is exactly overhead (a ≈ 0) any u ⊥ axis works.
  const u = a > 1e-6
    ? [cPerp[0] / a, cPerp[1] / a, cPerp[2] / a]
    : normalize(cross(axis, Math.abs(axis[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0]));
  const v = cross(axis, u);

  // Surface point at angle θ, plus whether it is on the sphere and sunlit.
  const at = (theta) => {
    const cosT = Math.cos(theta), sinT = Math.sin(theta);
    const disc = k * k - radius * radius - 2 * radius * a * cosT;
    const s = -k + Math.sqrt(Math.max(0, disc));
    const P = [
      C[0] + radius * (cosT * u[0] + sinT * v[0]) + s * axis[0],
      C[1] + radius * (cosT * u[1] + sinT * v[1]) + s * axis[1],
      C[2] + radius * (cosT * u[2] + sinT * v[2]) + s * axis[2]
    ];
    const valid = disc >= 0 && dot(P, sunDir) > 0;
    return { valid, P };
  };
  const toLonLat = (P) => [Math.atan2(P[1], P[0]) * RAD_TO_DEG, Math.asin(clamp(P[2], -1, 1)) * RAD_TO_DEG];

  // Exact boundary point between an invalid and a valid angle (bisection → the valid-side limit,
  // i.e. exactly on the limb or the terminator, whichever ends the arc).
  const boundaryPoint = (thetaInvalid, thetaValid) => {
    let ti = thetaInvalid, tv = thetaValid;
    for (let iter = 0; iter < 24; iter++) { const mid = (ti + tv) / 2; if (at(mid).valid) tv = mid; else ti = mid; }
    return toLonLat(at(tv).P);
  };

  // Sample validity + points once around the ring.
  const valid = new Array(steps), point = new Array(steps);
  for (let i = 0; i < steps; i++) { const e = at((i / steps) * TAU); valid[i] = e.valid; point[i] = e.valid ? toLonLat(e.P) : null; }

  const segments = [];
  const emit = (points) => { for (const seg of splitAtAntimeridian(points)) if (seg.length > 1) segments.push(seg); };

  if (valid.every(Boolean)) {
    emit([...point, point[0]]); // fully closed ring
  } else if (valid.some(Boolean)) {
    // Walk from a gap so runs never wrap the θ=0 seam; anchor each end on its exact boundary.
    const thetaOf = (i) => (i / steps) * TAU;
    const adjacent = (invalidIdx, validIdx) => {           // bring the two angles within one step
      let ti = thetaOf(invalidIdx), tv = thetaOf(validIdx);
      if (ti - tv > Math.PI) ti -= TAU; else if (tv - ti > Math.PI) ti += TAU;
      return [ti, tv];
    };
    const finish = (run) => {
      const prev = (run.start - 1 + steps) % steps, next = (run.end + 1) % steps;
      const startB = boundaryPoint(...adjacent(prev, run.start));
      const endB = boundaryPoint(...adjacent(next, run.end));
      emit([startB, ...run.points, endB]);
    };

    const start = valid.indexOf(false);
    let run = null;
    for (let n = 0; n < steps; n++) {
      const i = (start + n) % steps;
      if (valid[i]) { if (!run) run = { start: i, points: [] }; run.points.push(point[i]); run.end = i; }
      else if (run) { finish(run); run = null; }
    }
    if (run) finish(run);
  }

  return { type: 'Feature', geometry: { type: 'MultiLineString', coordinates: segments } };
}

/** Split a point run wherever consecutive longitudes jump the antimeridian. */
function splitAtAntimeridian(points) {
  const runs = [];
  let current = [points[0]];
  for (let i = 1; i < points.length; i++) {
    if (Math.abs(points[i][0] - points[i - 1][0]) > 180) { runs.push(current); current = [points[i]]; }
    else current.push(points[i]);
  }
  runs.push(current);
  return runs;
}

// --- tiny vec3 helpers ---
function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
function length(a) { return Math.hypot(a[0], a[1], a[2]); }
function normalize(a) { const l = length(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; }
function cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
function clamp(x, lo, hi) { return x < lo ? lo : x > hi ? hi : x; }
