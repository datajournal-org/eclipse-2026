// Per-frame map side effects for the B3 sky view: placing the Sun billboard in the scene and steering the
// map's light + hillshade to match the simulated Sun. Kept out of the component so update() reads as a list
// of steps. Only the MercatorCoordinate constructor is needed from the (dynamically imported) maplibre runtime.
import type { Map as MlMap } from 'maplibre-gl';
import { destPoint } from '$lib/shadow-globe/vec3';
import { DEG_TO_RAD as D2R } from '$lib/constants';
import type { SunState } from '$lib/skyview/sunLayer';
import type { EclipseGeometry } from '$lib/skyview/eclipseGeometry';
import type { StarState } from '$lib/skyview/starLayer';
import type { PlacedObject } from '$lib/skyview/skyObjects';

type Mlgl = { MercatorCoordinate: typeof import('maplibre-gl').MercatorCoordinate };

const SUN_DIST = 30000; // metres: far out in the sky (parallax negligible; the Sun reads at infinity)
// Point-sprite sizes in CSS pixels, mapped from the SQUARE ROOT of an object's magnitudes of headroom
// over the visibility threshold — the same Stevens-law compression as the opacity ramp (see
// RAMP_EXPONENT in skyObjects.ts), so the faint majority of the sky reads as stars rather than
// sub-pixel specks. The scale is chosen so the compression pivots at the top: Venus's ~6.9 magnitudes
// at full totality still land exactly on the cap, while a star half a magnitude over the threshold
// grows from 2.0 to 3.5 px.
const MIN_STAR_PX = 1.4,
	MAX_STAR_PX = 9,
	STAR_PX_PER_ROOT_MAG = 2.9;
const EYE = 1.7; // eye height (m) used to place the Sun disc above the ground

// Update the Sun billboard state from the current geometry: the Moon-disc offset/size (in Sun-radius units)
// that shapes the crescent, the real angular radius, the Mercator position far out along (az, alt), and
// whether the Sun is above the horizon.
export function placeSun(
	sun: SunState,
	geo: EclipseGeometry,
	opts: { maplibregl: Mlgl; m: MlMap; lat: number; lon: number }
) {
	const { maplibregl, m, lat: LAT, lon: LON } = opts;
	const s = geo.sun;
	const { sunAngR, dx, dy } = geo;
	sun.moon = [dx / sunAngR, dy / sunAngR];
	sun.moonR = geo.moonAngR / sunAngR;
	sun.angRad = sunAngR * D2R; // real angular radius (rad) → billboard drawn at true size

	const ground = m.queryTerrainElevation([LON, LAT] as [number, number]) ?? 0;
	const eyeAlt = ground + EYE;
	// place the Sun disc along (az, alt), far out in the sky
	const hd = SUN_DIST * Math.cos(s.alt * D2R),
		vd = SUN_DIST * Math.sin(s.alt * D2R);
	const [slng, slat] = destPoint(LAT, LON, s.az, hd);
	const merc = maplibregl.MercatorCoordinate.fromLngLat([slng, slat], eyeAlt + vd);
	sun.center = [merc.x, merc.y, merc.z, 1];

	// The Sun is drawn on top (sunLayer, depth test off): terrain occlusion is intentionally ignored — we
	// don't know the observer's height (street level vs. a rooftop), so a hill that would block the Sun from
	// the ground might not from a roof. Keep it visible until the whole disc has set — the apparent upper
	// limb below the horizon, i.e. the centre at -(angular radius). `s.alt` is the refracted centre altitude,
	// so this coincides with the standard sunset (astronomy-engine's SearchRiseSet) shown on the slider,
	// instead of vanishing ~2 min early when the centre (half the disc) crosses the horizon.
	sun.visible = s.alt > -sunAngR;
}

/**
 * Fill the star-layer buffers from the objects visible at this instant.
 *
 * Same placement trick as the Sun: put each object a long way out along its (az, alt) and let MapLibre's
 * projection do the rest, so they share one 3D world and orbit together. Sizes come from magnitude rather
 * than brightness, so a star that is fading in gets fainter without shrinking — which is how a real one
 * behaves as twilight deepens.
 */
export function placeSkyObjects(
	state: StarState,
	placed: PlacedObject[],
	opts: { maplibregl: Mlgl; m: MlMap; lat: number; lon: number }
) {
	const { maplibregl, m, lat: LAT, lon: LON } = opts;
	const n = placed.length;
	if (state.positions.length !== n * 3) {
		state.positions = new Float32Array(n * 3);
		state.sizes = new Float32Array(n);
		state.alphas = new Float32Array(n);
	}
	const ground = m.queryTerrainElevation([LON, LAT] as [number, number]) ?? 0;
	const eyeAlt = ground + EYE;

	for (let i = 0; i < n; i++) {
		const { alt, az, brightness, headroom } = placed[i];
		const hd = SUN_DIST * Math.cos(alt * D2R),
			vd = SUN_DIST * Math.sin(alt * D2R);
		const [slng, slat] = destPoint(LAT, LON, az, hd);
		const merc = maplibregl.MercatorCoordinate.fromLngLat([slng, slat], eyeAlt + vd);
		state.positions[i * 3] = merc.x;
		state.positions[i * 3 + 1] = merc.y;
		state.positions[i * 3 + 2] = merc.z ?? 0;
		// Size from the SAME headroom that drives opacity, not from the catalogue magnitude. A point source
		// has no angular size of its own — how big it looks is entirely how much light arrives — so an
		// object that is dim because the sky has not darkened yet, or because it sits low in the haze,
		// must be small as well as faint. Sizing off the catalogue instead made a fading Venus keep its
		// full width and merely turn transparent, which reads as a ghost rather than a star.
		state.sizes[i] = Math.min(MAX_STAR_PX, MIN_STAR_PX + STAR_PX_PER_ROOT_MAG * Math.sqrt(headroom));
		state.alphas[i] = brightness;
	}
	state.count = n;
	state.version++;
	state.ready = true;
}

/**
 * Last hillshade direction pushed to each map, so an unchanged one is not pushed again.
 *
 * The direction is quantised to whole degrees, but the scrubber has far more steps than the Sun has
 * degrees of azimuth to travel: over the eclipse window at Oviedo, 241 slider positions produce just
 * **30 distinct** directions. Writing the other 211 changes nothing on screen and is not free —
 * `setPaintProperty` re-evaluates the layer and re-renders the hillshade, measured at ~2 ms of extra
 * frame time, which is most of the cost of a scrub. A WeakMap rather than a module-level variable so
 * two maps (or two tests) cannot see each other's state, and a removed map is not retained.
 */
const lastHillshadeDir = new WeakMap<MlMap, number>();

// Steer the map's directional light and hillshade to match the simulated Sun's azimuth/altitude and the
// eclipse's brightness/colour (same numbers that drive the Sun billboard and the twilight veil).
export function syncMapLighting(m: MlMap, az: number, alt: number, env: { light: string; intensity: number }) {
	m.setLight({
		anchor: 'map',
		position: [1.15, az, 90 - alt] as [number, number, number],
		color: env.light,
		intensity: env.intensity
	});
	// Round BEFORE wrapping: wrapping first lets 359.6° round up to 360, which is outside the
	// property's 0–359 range.
	const direction = ((Math.round(az) % 360) + 360) % 360;
	if (lastHillshadeDir.get(m) === direction) return;
	lastHillshadeDir.set(m, direction);
	m.setPaintProperty('hillshade', 'hillshade-illumination-direction', direction);
}
