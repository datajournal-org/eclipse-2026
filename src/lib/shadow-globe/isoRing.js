// Iso-coverage rings = intersection of a cylinder (radius X around the shadow axis) with the unit
// sphere, restricted to the sunlit hemisphere. Smooth, analytic, high-resolution — no marching
// squares. See shadowProfile.js for how X is picked from a coverage level.
//
// With an orthonormal basis {u, v, axis} where u is the axis-perpendicular part of the centre C,
// the cylinder point C + X·(cosθ·u + sinθ·v) + s·axis lies on the unit sphere when
//     s = −k + √(k² − X² − 2·X·a·cosθ),   k = C·axis,  a = |C − (C·axis)·axis|.
// We take the +√ (sunward) root and keep only the day side. Where the discriminant is negative the
// ring runs off the limb, so it is simply left open there.

/** Empty ring geometry, for initialising a MapLibre source before the first frame. */
export const EMPTY_LINES = { type: 'Feature', geometry: { type: 'MultiLineString', coordinates: [] } };

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

  // Sample one full turn; null where the ring leaves the sphere or the night side.
  const points = new Array(steps);
  for (let i = 0; i < steps; i++) {
    const theta = (i / steps) * 2 * Math.PI;
    const cosT = Math.cos(theta), sinT = Math.sin(theta);
    const disc = k * k - radius * radius - 2 * radius * a * cosT;
    if (disc < 0) { points[i] = null; continue; }
    const s = -k + Math.sqrt(disc);
    const px = C[0] + radius * (cosT * u[0] + sinT * v[0]) + s * axis[0];
    const py = C[1] + radius * (cosT * u[1] + sinT * v[1]) + s * axis[1];
    const pz = C[2] + radius * (cosT * u[2] + sinT * v[2]) + s * axis[2];
    if (px * sunDir[0] + py * sunDir[1] + pz * sunDir[2] <= 0) { points[i] = null; continue; } // night side
    const lat = Math.asin(clamp(pz, -1, 1)) * RAD_TO_DEG;
    const lon = Math.atan2(py, px) * RAD_TO_DEG;
    points[i] = [lon, lat];
  }

  // Start at a gap so an open ring never wraps the θ=0 seam; a fully closed ring repeats its start.
  const firstGap = points.findIndex((p) => p === null);
  const closed = firstGap === -1;
  const order = [];
  const startAt = closed ? 0 : firstGap;
  for (let n = 0; n < steps; n++) order.push((startAt + n) % steps);
  if (closed) order.push(startAt);

  const segments = [];
  let run = [];
  for (const i of order) {
    const point = points[i];
    if (!point) {
      if (run.length > 1) segments.push(run);
      run = [];
    } else if (run.length && Math.abs(point[0] - run[run.length - 1][0]) > 180) {
      if (run.length > 1) segments.push(run); // split at the antimeridian
      run = [point];
    } else {
      run.push(point);
    }
  }
  if (run.length > 1) segments.push(run);

  return { type: 'Feature', geometry: { type: 'MultiLineString', coordinates: segments } };
}

// --- tiny vec3 helpers ---
function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
function length(a) { return Math.hypot(a[0], a[1], a[2]); }
function normalize(a) { const l = length(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; }
function cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
function clamp(x, lo, hi) { return x < lo ? lo : x > hi ? hi : x; }
