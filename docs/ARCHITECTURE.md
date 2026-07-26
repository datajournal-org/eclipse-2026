# Technical Architecture

Implementation decisions for the solar eclipse app (12 August 2026).
Complements [`CONCEPT.md`](./CONCEPT.md) and [`WIREFRAMES.md`](./WIREFRAMES.md).

---

## Core principle

- **Fully static, no backend.** All eclipse maths runs in the browser.
- **Privacy by design:** the location never leaves the device; no account, no user data.
- **Offline-capable (PWA):** once a location is set, everything works offline (concept D4).
- **Hosting:** static build, served via **bunny.net** (CDN).

---

## Stack (fixed)

| Layer       | Choice                                                               |
| ----------- | -------------------------------------------------------------------- |
| Framework   | **SvelteKit** (static adapter, prerendered)                          |
| Astronomy   | **`astronomy-engine`** (pure JS, in the browser) — results validated |
| Maps/3D     | **MapLibre GL JS** (globe projection for A2, 3D scene for B3)        |
| Geocoder    | **VersaTiles geocoder** (see playground below)                       |
| Map data    | **VersaTiles** tiles (satellite, OSM vector, elevation)              |
| i18n        | from the start, initial set DE / EN / ES; formats via native `Intl`  |
| Offline     | service worker (PWA), cache the location's tiles when it is set      |
| Hosting/CDN | static via **bunny.net**                                             |
| Backend     | **none**                                                             |

---

## Data sources (VersaTiles)

| Purpose    | URL                                               | Type / format           | Notes                                                              |
| ---------- | ------------------------------------------------- | ----------------------- | ------------------------------------------------------------------ |
| Satellite  | `tiles.versatiles.org/tiles/satellite/tiles.json` | raster, WebP, z0–19     | background texture                                                 |
| OSM vector | `tiles.versatiles.org/tiles/osm/tiles.json`       | vector (pbf)            | layer `buildings`, field **`height`** (m), `min_height`, `hide_3d` |
| Elevation  | `tiles.versatiles.org/tiles/elevation/tiles.json` | raster, WebP, z0–**12** | **terrarium encoding** → `raster-dem`, `encoding: "terrarium"`     |
| Geocoder   | Playground: `versatiles.org/playground/geocoder/` | —                       | place search + reverse (for map tap)                               |

**Notes:**

- Elevation only up to z12 → coarse close up, but sufficient for **mountains on the horizon**
  (far field). The **near field** is handled by the OSM buildings.
- Building height comes directly from `height` — no estimating from floor counts needed.

---

## Components

### 1. Astronomy engine

`astronomy-engine` computes for any lat/lon: obscuration, contact times (1st–4th), duration
during totality, and the Sun's altitude/azimuth over time.
**Quality assurance:** cross-check results for reference cities against the published
Espenak/NASA tables (this also clears up the contradictory Wikipedia values).

### 2. Location

- **GPS:** browser `Geolocation` API.
- **Place search:** VersaTiles geocoder.
- **Map tap:** click on the map → reverse geocoding for the place name.
- Chosen place in `localStorage` **and** the URL (`?lat=&lon=`) → shareable, stays local.

### 3. Shadow run (A2)

MapLibre GL JS with **globe projection**. Two separate layers:

- **Whole path (precomputed, static):** central line and umbra/penumbra edges as **GeoJSON
  computed at build time**, drawn as **dashed lines** — they hint at the whole path without
  dominating the view.
- **Current shadow (live from the slider):** for the slider's current time, the position and
  shape of the umbral shadow (umbra ellipse) + penumbra are computed **in real time** from
  `astronomy-engine` and rendered as a moving, solid area. Optionally the day/night boundary
  (terminator) live alongside.

This keeps the path visible at all times as a dashed trace while the slider moves the real
shadow smoothly over it — no interpolation from precomputed waypoints.

### 4. 3D horizon + time slider (B3) — core feature

A MapLibre 3D scene combining a **stylised OSM vector ground** (`@versatiles/style`, theme
`colorful`), **terrain/hillshade (elevation, far field)**, and **`fill-extrusion` 3D buildings
(OSM, near field, `height`)**. The theme's flat building layers are replaced by extrusions. Time
slider = pure UI, shares the astronomy engine. Details on the Sun below.
_(Satellite tiles remain reserved for the A2 globe.)_

### 6. Checklist (B6)

**Non-interactive** — a plain text list. `.ics` calendar export client-side.

### 7. i18n

Text from language files, `Intl` for date/number/compass direction, switching in the header,
default from the browser. Start: DE / EN / ES.

### 8. App shell

SvelteKit prerendered → static files on bunny.net. A service worker makes the app usable
offline after the first visit (and once a location is set).

---

## Realistic rendering of the Sun (B3) — core problem solved

Three guarantees. "Realistic" = geometrically correctly placed and visually plausibly occluded.

**1. Correct place in the sky.**
`astronomy-engine` → exact (azimuth, altitude). The Sun is placed as an object in the same 3D
world, not as an overlay: a **`CustomLayerInterface` WebGL layer** that reuses MapLibre's
projection matrix. Position = observer + direction vector (az, alt) at a large distance → it
shares the space with terrain and buildings.

**2. Correct camera (first-person view).**
MapLibre **v5 no longer has `FreeCameraOptions`**. Instead
**`map.calculateCameraOptionsFromTo(eye, eyeHeight, target, targetHeight)`** → computes the
first-person camera from the observer's eye point and a target point along the Sun's azimuth.
The target sits at a **fixed slight downward angle (~6°)**, _not_ at the Sun's altitude —
otherwise a high Sun demands a pitch > maxPitch, the clamp produces a degenerate camera and the
foreground flickers/disappears. This keeps the pitch stable at ~84°; the low Sun appears in the
upper part of the frame.

**3. Plausible occlusion (purely visual, no textual claim).**
Buildings (`fill-extrusion`) write to the depth buffer → the WebGL Sun is correctly occluded
behind houses via the depth test. For **terrain** (whose depth buffer MapLibre doesn't reliably
expose to custom layers), the **terrain horizon is sampled along the Sun's azimuth**
(`queryTerrainElevation`, including the Earth-curvature dip); the Sun is hidden/faded once it
drops below it — so it disappears behind mountains and at sunset. The user sees in the 3D scene
itself whether anything is in the way. **Deliberately no computed claim** like "Sun occluded
from 20:40" — a reliable ray sampling of terrain and buildings is not feasible in the frontend
(elevation only z12, buildings only near field, expensive tile sampling). The only hard textual
time is **sunset** (geometric, from `astronomy-engine` — no terrain needed).

**Appearance (crescent, size).**
Obscuration/magnitude from `astronomy-engine` → crescent geometry (Sun/Moon disc, radii ~0.25°,
offset from magnitude) as a shader/quad. **Honest trade-off:** the real Sun is ~0.5° across, a
tiny dot in the ~37° field of view → a **moderate magnification (2–4×)** as a clearly labelled
presentation aid, while the **exact numbers stay shown numerically**. Atmospheric tint optional
via MapLibre's `sky`.

**Safeguard:** cross-check the rendered az/altitude and contact times against `astronomy-engine`
and Espenak; numbers visible in the UI → realism is verifiable, not asserted.

---

## Open points / risks

- **Elevation z12** coarse in the near field — check whether mountains on the horizon look
  visually convincing; the near field is carried by the buildings.
- **First-person camera + terrain:** `calculateCameraOptionsFromTo` at eye height; watch for
  camera clipping into the terrain (on very steep terrain right at the location).
- **Terrain occlusion of the Sun:** solved via horizon sampling (fade below the terrain
  horizon). Limitation: binary/faded for the whole disc, no partial clipping by a ridge.
- **Live shadow (A2):** compute the umbra ellipse at the slider time from Besselian elements /
  `astronomy-engine` in real time — check scrubbing performance.
- **Sun size:** the magnification factor (2–4×) is a UX decision — calibrate with real renders.
- **Crescent orientation:** derive the crescent's position angle correctly from the geometry
  (don't guess), otherwise it's "the wrong way round".
- **Geocoder limits/attribution** from VersaTiles to be checked.

---

## Prototypes (vertical slice A2 + B3)

In the [`prototype/`](../prototype/) folder — runnable via `npx serve .` or
`python3 -m http.server`, then `index.html`.

- `eclipse.mjs` — shared eclipse maths, runs in Node **and** the browser (an import map resolves
  `astronomy-engine` via esm.sh).
- `a2.html` — globe, whole path **dashed** (precomputed), **live umbral shadow** in real time
  from the slider (`shadowCenter()` per frame).
- `b3.html` — first-person 3D facing west, VersaTiles terrain + buildings, **Sun as a custom
  WebGL layer** with a geometrically oriented crescent; camera currently high pitch instead of
  FreeCamera.
- `validate.mjs` — `node validate.mjs` checks the maths against known values.

**Solved / verified:**

- The shadow centre agrees **to 0.0 km** with `SearchGlobalSolarEclipse` — the key: the Sun
  vector **with aberration** (`GeoVector(Sun, t, true)`).
- Crescent geometry (our own disc-overlap formula) matches astronomy-engine's obscuration to ~1%.

**Still open:** A2 partiality rings; polish (check crescent orientation against a reference,
calibrate Sun size/fade).

**Verified & fixed via Playwright screenshots:**

- B3 renders the vector ground (colorful), 3D buildings, first-person camera, crescent; terrain
  occludes the Sun (Innsbruck: a 6° mountain horizon hides the 1.7° Sun).
- **Pitfall 1:** `@versatiles/style` needs an explicit `baseUrl` in the browser
  (`colorful({ baseUrl: 'https://tiles.versatiles.org' })`) — otherwise 404s against
  `location.origin`.
- **Pitfall 2:** the custom WebGL Sun was clipped by the far plane → in the vertex shader
  `clip.z = min(clip.z, clip.w*0.9999)`.
- **Pitfall 3:** aiming the camera at the Sun's altitude → pitch clamp for a high Sun →
  foreground flickers/buildings disappear. Fix: a fixed downward target angle (camera stable
  regardless of time).
- Labels are off by default in B3 (`style.layers.filter(l => l.type !== 'symbol')`).

## Validated reference values (astronomy-engine, UTC)

| Location                       | Kind    | Obscuration | Maximum  | Sun altitude | Azimuth  |
| ------------------------------ | ------- | ----------- | -------- | ------------ | -------- |
| Greatest eclipse (off Iceland) | total   | 100%        | 17:45:46 | —            | —        |
| Reykjavík                      | total   | 100%        | 17:48    | 24.6°        | —        |
| Oviedo (N Spain)               | total   | 100%        | 18:27    | 10.3°        | —        |
| Palma                          | total   | 100%        | 18:31    | 2.6°         | —        |
| Berlin                         | partial | **84.8%**   | 18:08    | 3.5°         | 290° WNW |
| Munich                         | partial | **88.7%**   | 18:15    | 2.1°         | —        |

"Munich > Berlin" confirmed: Munich lies further south, closer to the path. Local time = UTC + 2
(CEST), i.e. maximum in Berlin ≈ **20:08** CEST.
