// Derives the B3 map's brightness + light from the simulated Sun's obscuration, so the whole scene dims
// and cools as the Sun is covered instead of staying a static daylit view. The Sun's azimuth/altitude
// (position) is applied by the caller; this module owns the eclipse-driven brightness. Pure math.
//
// Brightness is delivered two ways because MapLibre has no global exposure:
//   · `intensity` + `light` feed setLight → shade the terrain & 3D buildings from the Sun's direction.
//   · `veil` is the opacity of a twilight-coloured DOM overlay (DUSK_HEX) that dims EVERYTHING uniformly
//     — including the flat vector base map (roads/land), which setLight does not touch.
import { hexToRgb } from '$lib/brand';

type Rgb = [number, number, number];

/** The blue-grey the scene fades toward near totality (also the DOM veil colour). */
export const DUSK_HEX = '#20263a';
const TWILIGHT: Rgb = hexToRgb(DUSK_HEX);
const SUNLIGHT: Rgb = hexToRgb('#fff2dc'); // warm white of the directional light at full Sun

const FLOOR = 0.06; // residual brightness at totality (corona / horizon glow — never full black)
const GAMMA = 0.35; // <1 keeps the scene bright through most of the partial phase, dropping near totality
const MAX_VEIL = 0.82; // opacity of the dusk veil at totality

const mix = (a: Rgb, b: Rgb, t: number): Rgb => [
	a[0] + (b[0] - a[0]) * t,
	a[1] + (b[1] - a[1]) * t,
	a[2] + (b[2] - a[2]) * t
];
const css = (c: Rgb): string => `rgb(${Math.round(c[0] * 255)}, ${Math.round(c[1] * 255)}, ${Math.round(c[2] * 255)})`;

export type Environment = {
	brightness: number; // 1 = full daylight, ~FLOOR at totality
	veil: number; // dusk-overlay opacity (0 → MAX_VEIL)
	light: string; // directional-light colour (warm → cool as the eclipse deepens)
	intensity: number; // directional-light intensity (~0.5 daylight → ~0.2 totality)
};

/** Map appearance for a given eclipse obscuration (0..1) — one perceptual brightness driving all outputs. */
export function environment(obsc: number): Environment {
	const brightness = FLOOR + (1 - FLOOR) * Math.pow(Math.max(0, 1 - obsc), GAMMA);
	const toDark = 1 - brightness; // 0 at full Sun → ~0.94 at totality
	return {
		brightness,
		veil: toDark * MAX_VEIL,
		light: css(mix(SUNLIGHT, TWILIGHT, toDark)),
		// gentle: the veil owns overall brightness, so the directional light is only a soft sun-side cue.
		// (Kept low so back-lit building faces — the camera looks toward the Sun — don't crush to black.)
		intensity: 0.05 + 0.2 * brightness
	};
}
