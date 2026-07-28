// Per-frame state updates for the B3 sky view: pointing the Sun billboard and the star sprites along
// their current sky directions, and steering the map's light + hillshade to match the simulated Sun.
// Kept out of the component so update() reads as a list of steps.
//
// Celestial objects are stored as unit DIRECTIONS, not positions. The layers place each one at
// `camera + direction x offset` every rendered frame (sunLayer.ts / starLayer.ts), so the sky rides
// along with the camera and shows zero parallax — the defining property of something at infinity. The
// previous design anchored them at fixed points 30 km from the OBSERVER, which parallaxed against the
// terrain as the camera moved: a full dolly (50 -> 1000 m) swung the Sun by atan(950 / 30000) ~ 1.8°,
// three and a half Sun diameters, against the horizon.
import type { Map as MlMap } from 'maplibre-gl';
import { DEG_TO_RAD as D2R } from '$lib/constants';
import type { SunState } from '$lib/skyview/sunLayer';
import type { EclipseGeometry } from '$lib/skyview/eclipseGeometry';
import type { StarState } from '$lib/skyview/starLayer';
import type { PlacedObject } from '$lib/skyview/skyObjects';

// Point-sprite sizes in CSS pixels, mapped from the SQUARE ROOT of an object's magnitudes of headroom
// over the visibility threshold — the same Stevens-law compression as the opacity ramp (see
// RAMP_EXPONENT in skyObjects.ts), so the faint majority of the sky reads as stars rather than
// sub-pixel specks. The scale is chosen so the compression pivots at the top: Venus's ~6.9 magnitudes
// at full totality still land exactly on the cap, while a star half a magnitude over the threshold
// grows from 2.0 to 3.5 px.
const MIN_STAR_PX = 0.3,
	MAX_STAR_PX = 9,
	STAR_PX_PER_ROOT_MAG = 1.5;

/**
 * A unit direction along (azimuth, altitude), in Mercator axis convention: +x east, +y SOUTH (Mercator y
 * grows downward on the map), +z up. Mercator is conformal and MapLibre scales altitude by the same
 * per-latitude factor as the ground axes, so a locally isotropic unit vector keeps its true direction.
 * Exported for the other camera-anchored sky furniture (the compass ruler).
 */
export function dirFromAzAlt(azDeg: number, altDeg: number): [number, number, number] {
	const az = azDeg * D2R,
		alt = altDeg * D2R;
	return [Math.cos(alt) * Math.sin(az), -Math.cos(alt) * Math.cos(az), Math.sin(alt)];
}

// Update the Sun billboard state from the current geometry: the Moon-disc offset/size (in Sun-radius units)
// that shapes the crescent, the real angular radius, the unit direction along (az, alt), and whether the
// Sun is above the horizon. Pure — the camera anchoring happens in the layer, every rendered frame.
export function placeSun(sun: SunState, geo: EclipseGeometry) {
	const s = geo.sun;
	const { sunAngR, dx, dy } = geo;
	sun.moon = [dx / sunAngR, dy / sunAngR];
	sun.moonR = geo.moonAngR / sunAngR;
	sun.angRad = sunAngR * D2R; // real angular radius (rad) → billboard drawn at true size
	sun.dir = dirFromAzAlt(s.az, s.alt);

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
 * Same convention as the Sun: each object is a unit direction (dirFromAzAlt), anchored to the camera by
 * the layer every rendered frame, so the whole sky shares one 3D world and shows no parallax. Sizes come
 * from magnitude rather than brightness, so a star that is fading in gets fainter without shrinking —
 * which is how a real one behaves as twilight deepens.
 */
export function placeSkyObjects(state: StarState, placed: PlacedObject[]) {
	const n = placed.length;
	if (state.dirs.length !== n * 3) {
		state.dirs = new Float32Array(n * 3);
		state.sizes = new Float32Array(n);
		state.alphas = new Float32Array(n);
	}

	for (let i = 0; i < n; i++) {
		const { alt, az, brightness, headroom } = placed[i];
		const [e, s, u] = dirFromAzAlt(az, alt);
		state.dirs[i * 3] = e;
		state.dirs[i * 3 + 1] = s;
		state.dirs[i * 3 + 2] = u;
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
 * degrees of azimuth to travel: over the eclipse window at Oviedo, ~780 slider positions (10 s frames)
 * produce just **30 distinct** directions. Writing the other ~750 changes nothing on screen and is not free —
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
