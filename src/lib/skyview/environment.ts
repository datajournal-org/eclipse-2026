// Derives the B3 map's brightness from the simulated Sun's obscuration, so the whole scene dims as the Sun
// is covered instead of staying a static daylit view. The Sun's azimuth/altitude (position) is applied by
// the caller; this module owns the eclipse-driven brightness. Pure math.
//
// MapLibre has no global exposure, and setLight only shades the 3D BUILDINGS (fill-extrusion) — NOT the
// terrain, hillshade or flat vector fills. So a single DOM overlay (`veil`, DUSK_HEX) owns ALL eclipse
// dimming and covers buildings AND terrain uniformly. The directional light is kept CONSTANT — a fixed
// warm sun-side cue that only gives the buildings their 3D shape. If it dimmed/cooled with the eclipse
// too (as it used to), the buildings would darken faster than the flat terrain the veil alone dims.

/** The blue-grey the scene fades toward near totality (the DOM veil colour). */
export const DUSK_HEX = '#20263a';

const FLOOR = 0.06; // residual brightness at totality (corona / horizon glow — never full black)
const GAMMA = 0.35; // <1 keeps the scene bright through most of the partial phase, dropping near totality
const MAX_VEIL = 0.82; // opacity of the dusk veil at totality

const LIGHT_COLOR = '#fff2dc'; // constant warm white of the directional building light
const LIGHT_INTENSITY = 0.25; // constant contrast — the veil owns all eclipse dimming

export type Environment = {
	brightness: number; // 1 = full daylight, ~FLOOR at totality
	veil: number; // dusk-overlay opacity (0 → MAX_VEIL) — the single, uniform eclipse dimmer
	light: string; // directional building-light colour (constant)
	intensity: number; // directional building-light intensity (constant)
};

/** Map appearance for a given eclipse obscuration (0..1). The veil is the one eclipse dimmer; the
 *  directional light stays constant so buildings and terrain dim together at the same rate. */
export function environment(obsc: number): Environment {
	const brightness = FLOOR + (1 - FLOOR) * Math.pow(Math.max(0, 1 - obsc), GAMMA);
	return {
		brightness,
		veil: (1 - brightness) * MAX_VEIL,
		light: LIGHT_COLOR,
		intensity: LIGHT_INTENSITY
	};
}
