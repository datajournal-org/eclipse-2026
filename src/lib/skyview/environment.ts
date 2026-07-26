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

const MAX_VEIL = 0.97; // opacity of the dusk veil at totality (near-black, once its colour darkens too)
const VEIL_STEEP = 9; // higher → gentle dimming through the partial phase, then a sharp plunge near totality

const LIGHT_COLOR = '#fff2dc'; // constant warm white of the directional building light
const LIGHT_INTENSITY = 0.25; // constant contrast — the veil owns all eclipse dimming

export type Environment = {
	brightness: number; // 1 = full daylight, 0 at totality
	veil: number; // dusk-overlay opacity (0 → MAX_VEIL) — the single, uniform eclipse dimmer
	light: string; // directional building-light colour (constant)
	intensity: number; // directional building-light intensity (constant)
};

/** Map appearance for a given eclipse obscuration (0..1). The veil is the one eclipse dimmer; the
 *  directional light stays constant so buildings and terrain dim together at the same rate. */
export function environment(obsc: number): Environment {
	const o = Math.max(0, Math.min(1, obsc));
	// veil rises steeply only as totality approaches: gentle through the partial phase, near-total at o→1.
	const veil = MAX_VEIL * Math.pow(o, VEIL_STEEP);
	return {
		brightness: 1 - Math.pow(o, VEIL_STEEP),
		veil,
		light: LIGHT_COLOR,
		intensity: LIGHT_INTENSITY
	};
}

// Twilight dimming from the Sun's altitude — the scene fades toward dusk as the Sun sinks, independently of
// the eclipse. Full daylight while the Sun is well up; ramps in from DUSK_ALT_HI down to near-complete
// twilight a few degrees below the horizon. Combined (screen) with the eclipse veil by the caller.
const DUSK_ALT_HI = 8; // ° above the horizon: dusk dimming begins
const DUSK_ALT_LO = -6; // ° below the horizon: near-complete twilight
const MAX_DUSK_VEIL = 0.9; // opacity at full twilight (an evening event → dusk, not midnight-black)

export function duskVeil(sunAltDeg: number): number {
	const t = Math.max(0, Math.min(1, (DUSK_ALT_HI - sunAltDeg) / (DUSK_ALT_HI - DUSK_ALT_LO)));
	return MAX_DUSK_VEIL * t * t * (3 - 2 * t); // smoothstep — gentle start, no hard edge at the top
}
