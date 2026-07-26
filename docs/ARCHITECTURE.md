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

Two guarantees. "Realistic" = geometrically correctly placed, at its true angular size.

**1. Correct place in the sky.**
`astronomy-engine` → exact (azimuth, altitude). The Sun is placed as an object in the same 3D
world, not as an overlay: a **`CustomLayerInterface` WebGL layer** that reuses MapLibre's
projection matrix. Position = observer + direction vector (az, alt) at a large distance, so it
reads as being at infinity.

**2. Correct camera (third-person orbit).**
MapLibre **v5 has no `FreeCameraOptions`**, so the camera is built with
**`map.calculateCameraOptionsFromTo(from, fromAlt, to, toAlt)`**: it sits ~200 m behind a marker
at the location, at a **constant sea-level altitude** (`setCenterClampedToGround(false)`, so it
does not bob as the view centre moves over terrain), framed by `skyview/framing.ts` (a wide
`setVerticalFieldOfView` + centre azimuth) to show the whole Sun arc with the marker in the lower
third. Horizontal drag **orbits** the camera around the marker (bearing only, height fixed → the
pitch stays < 90°); a reset control returns to the Sun-facing framing.

**Appearance — real size, no occlusion.**
The Sun/Moon discs come from `astronomy-engine` (angular radii ~0.25°, Moon offset from the
geometry) as a shader/quad, drawn at their **real angular size**: the billboard radius is mapped
through the vertical FOV each frame (`skyview/sunLayer.ts`), and the Moon is drawn in Sun-radius
units so it scales with the Sun. So the eclipsed Sun is a small, accurate disc, not an enlarged
one. It is drawn **on top** (depth test off) and hidden only below the true (sea-level) horizon;
**terrain occlusion is intentionally not modelled** — the observer's height (street level vs. a
rooftop) is unknown, so a hill that would block the Sun from the ground might not from a roof.
The only hard textual time is **sunset** (geometric, from `astronomy-engine`). Sky/light comes
from `skyview/environment.ts`: a dusk veil (a DOM overlay inside the map canvas, under the marker)
dims the whole scene with the obscuration, plus a constant directional light for the buildings'
3D shape.

**Safeguard:** cross-check the rendered az/altitude and contact times against `astronomy-engine`
and Espenak; numbers visible in the UI → realism is verifiable, not asserted.

---

## Open points / risks

- **Elevation z12** coarse in the near field — check whether mountains on the horizon look
  visually convincing; the near field is carried by the buildings.
- **Camera over steep terrain:** the camera sits ~200 m behind the marker at a constant altitude
  (`setCenterClampedToGround(false)`); on very steep ground near the location, verify the framing
  doesn't clip.
- **Live shadow (A2):** compute the umbra ellipse at the slider time from Besselian elements /
  `astronomy-engine` in real time — check scrubbing performance.
- **Crescent orientation:** derive the crescent's position angle correctly from the geometry
  (don't guess), otherwise it's "the wrong way round".
- **Geocoder limits/attribution** from VersaTiles to be checked.

---

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
