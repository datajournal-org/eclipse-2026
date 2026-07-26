// Colour helpers for the B3 sky view: the veil tint that darkens the scene toward totality, and the
// loupe background that mirrors the sky behind the low Sun. Kept out of the component so the maths is
// testable and the palette lives in one place.
import { SKY_PALETTE } from '$lib/config';
import { DUSK_HEX } from '$lib/skyview/environment';
import { hexToRgb } from '$lib/brand';

export type Rgb = [number, number, number];

const SKY_HI = hexToRgb(SKY_PALETTE.sky);
const SKY_LO = hexToRgb(SKY_PALETTE.horizon);
const DUSK_RGB = hexToRgb(DUSK_HEX);
const NIGHT_RGB = hexToRgb('#05070d'); // near-black the veil trends toward at totality

export const mix3 = (a: Rgb, b: Rgb, t: number): Rgb => [
	a[0] + (b[0] - a[0]) * t,
	a[1] + (b[1] - a[1]) * t,
	a[2] + (b[2] - a[2]) * t
];

export const cssRgb = (c: Rgb) => `rgb(${Math.round(c[0] * 255)} ${Math.round(c[1] * 255)} ${Math.round(c[2] * 255)})`;

// Veil tint: dusk-blue through the partial phase and early twilight, darkening toward near-black night as
// the eclipse nears totality OR the Sun sinks well below the horizon — so both the eclipse plunge and the
// after-sunset dusk read as (almost) night rather than just "more blue".
export function veilColour(obsc: number, sunAltDeg: number): Rgb {
	const eclipseNight = Math.max(0, Math.min(1, (obsc - 0.9) / 0.1));
	const duskNight = Math.max(0, Math.min(1, (-sunAltDeg - 2) / 6)); // Sun ~2°..8° below horizon → toward night
	return mix3(DUSK_RGB, NIGHT_RGB, Math.max(eclipseNight, duskNight));
}

// Loupe background = the sky behind the low Sun: blend horizon→sky by altitude, then dim toward dusk
// exactly as the veil dims the scene, so the loupe reads as a zoomed cutout of that sky.
export function loupeSkyCss(sunAlt: number, veilRgb: Rgb, veilOpacity: number): string {
	const skyT = Math.max(0, Math.min(1, sunAlt / 30));
	return cssRgb(mix3(mix3(SKY_LO, SKY_HI, skyT), veilRgb, veilOpacity));
}

// Parse a CSS colour to normalised 0..1 RGB. The map's land colour arrives as `rgb(r,g,b)` (the VersaTiles
// style's background-color), not a hex string, so hexToRgb alone would read it as black.
function toRgb01(color: string): Rgb {
	const m = color.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
	if (m) return [+m[1] / 255, +m[2] / 255, +m[3] / 255];
	return hexToRgb(color);
}

// Ground below the loupe horizon = the map's own land colour, dimmed by the veil exactly as the veil dims
// the rendered scene's land — so the loupe reads as a true zoomed cutout: its ground matches the terrain
// around the marker rather than a separate silhouette tone.
export function loupeGroundCss(landColor: string, veilRgb: Rgb, veilOpacity: number): string {
	return cssRgb(mix3(toRgb01(landColor), veilRgb, veilOpacity));
}
