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

// Veil tint at a given obscuration: near totality, darken the veil from dusk-blue toward near-black, so
// the plunge reads as (almost) night rather than just "more blue".
export function veilColour(obsc: number): Rgb {
	const nightMix = Math.max(0, Math.min(1, (obsc - 0.9) / 0.1));
	return mix3(DUSK_RGB, NIGHT_RGB, nightMix);
}

// Loupe background = the sky behind the low Sun: blend horizon→sky by altitude, then dim toward dusk
// exactly as the veil dims the scene, so the loupe reads as a zoomed cutout of that sky.
export function loupeSkyCss(sunAlt: number, veilRgb: Rgb, veilOpacity: number): string {
	const skyT = Math.max(0, Math.min(1, sunAlt / 30));
	return cssRgb(mix3(mix3(SKY_LO, SKY_HI, skyT), veilRgb, veilOpacity));
}

// Ground silhouette below the loupe horizon: the scene's land colour sunk far toward night (a dusk
// silhouette that keeps a hint of the land's hue), then dimmed by the veil exactly as the sky is.
export function loupeGroundCss(landColorHex: string, veilRgb: Rgb, veilOpacity: number): string {
	const silhouette = mix3(hexToRgb(landColorHex), NIGHT_RGB, 0.82);
	return cssRgb(mix3(silhouette, veilRgb, veilOpacity));
}
