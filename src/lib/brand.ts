// Reads the app's design tokens so non-CSS consumers (the WebGL canvas) can honour the same palette.

export type BrandColor = { hex: string; rgb: [number, number, number] }; // rgb components in 0..1
export type Brand = { bg: BrandColor; accent: BrandColor; accent2: BrandColor };

/** '#rgb' / '#rrggbb' → [r, g, b] in 0..1. */
export function hexToRgb(hex: string): [number, number, number] {
	const h = hex.replace('#', '');
	const full = h.length === 3 ? [...h].map((c) => c + c).join('') : h;
	const n = parseInt(full, 16);
	return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

/** Pull the brand colours from the CSS custom properties on :root (throws if a token is missing). */
export function readBrandColors(): Brand {
	const css = getComputedStyle(document.documentElement);
	const token = (name: string): BrandColor => {
		const v = css.getPropertyValue(name).trim();
		if (!v || v.includes('var(')) throw new Error(`Missing design token ${name}`);
		return { hex: v, rgb: hexToRgb(v) };
	};
	return { bg: token('--bg'), accent: token('--accent'), accent2: token('--accent-2') };
}
