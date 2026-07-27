import { describe, it, expect } from 'vitest';
import { mix3, cssRgb, veilColour, loupeSkyCss, loupeGroundCss, type Rgb } from './colors';
import { hexToRgb } from '$lib/brand';
import { DUSK_HEX } from './environment';
import { SKY_PALETTE } from '$lib/config';

const parse = (css: string): Rgb => {
	const m = css.match(/rgb\((\d+) (\d+) (\d+)\)/);
	if (!m) throw new Error(`not a css rgb triple: ${css}`);
	return [+m[1] / 255, +m[2] / 255, +m[3] / 255];
};
const luma = (c: Rgb) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];

describe('mix3', () => {
	const a: Rgb = [0, 0, 0];
	const b: Rgb = [1, 0.5, 0.25];

	it('returns the endpoints', () => {
		expect(mix3(a, b, 0)).toEqual(a);
		expect(mix3(a, b, 1)).toEqual(b);
	});

	it('interpolates each channel independently', () => {
		expect(mix3(a, b, 0.5)).toEqual([0.5, 0.25, 0.125]);
	});

	it('extrapolates outside 0..1 (callers are responsible for clamping)', () => {
		expect(mix3(a, b, 2)[0]).toBe(2);
	});
});

describe('cssRgb', () => {
	it('renders the space-separated modern syntax', () => {
		expect(cssRgb([0, 0, 0])).toBe('rgb(0 0 0)');
		expect(cssRgb([1, 1, 1])).toBe('rgb(255 255 255)');
	});

	it('rounds to whole channel values', () => {
		expect(cssRgb([0.5, 0.5, 0.5])).toBe('rgb(128 128 128)');
		expect(cssRgb([0.4999, 0, 0])).toBe('rgb(127 0 0)');
	});

	it('round-trips a hex colour', () => {
		expect(cssRgb(hexToRgb('#20263a'))).toBe('rgb(32 38 58)');
	});
});

describe('veilColour', () => {
	it('is dusk blue through the partial phase in daylight', () => {
		expect(veilColour(0, 20)).toEqual(hexToRgb(DUSK_HEX));
		expect(veilColour(0.5, 20)).toEqual(hexToRgb(DUSK_HEX));
		expect(veilColour(0.9, 20)).toEqual(hexToRgb(DUSK_HEX));
	});

	it('darkens toward night over the last 10 % of coverage', () => {
		const partial = veilColour(0.9, 20);
		const deep = veilColour(0.95, 20);
		const total = veilColour(1, 20);
		expect(luma(deep)).toBeLessThan(luma(partial));
		expect(luma(total)).toBeLessThan(luma(deep));
	});

	it('darkens with the Sun below the horizon even without an eclipse', () => {
		// Both drivers matter: Palma's eclipse ends at dusk, so the loupe must go dark for the sunset
		// too, not only for the eclipse plunge.
		const day = veilColour(0, 10);
		const dusk = veilColour(0, -4);
		const night = veilColour(0, -8);
		expect(luma(dusk)).toBeLessThan(luma(day));
		expect(luma(night)).toBeLessThan(luma(dusk));
	});

	it('takes whichever of the two drivers is stronger', () => {
		// max(), not sum: a total eclipse at dusk must not be darker than night-black.
		const eclipseAtDusk = veilColour(1, -20);
		for (const [i, c] of veilColour(1, 20).entries()) expect(eclipseAtDusk[i]).toBeCloseTo(c, 12);
		for (const [i, c] of veilColour(0, -20).entries()) expect(eclipseAtDusk[i]).toBeCloseTo(c, 12);
	});

	it('holds daylight until the Sun is 2° below the horizon', () => {
		expect(veilColour(0, 0)).toEqual(hexToRgb(DUSK_HEX));
		expect(veilColour(0, -2)).toEqual(hexToRgb(DUSK_HEX));
		expect(luma(veilColour(0, -2.5))).toBeLessThan(luma(hexToRgb(DUSK_HEX)));
	});

	it('never overshoots past night', () => {
		const night = veilColour(1, -90);
		for (const alt of [-90, -30, -8, 0, 45]) {
			for (const obsc of [0, 0.5, 1]) {
				expect(luma(veilColour(obsc, alt))).toBeGreaterThanOrEqual(luma(night) - 1e-12);
			}
		}
	});

	it('stays a valid colour across the whole domain', () => {
		for (let obsc = 0; obsc <= 1; obsc += 0.1) {
			for (let alt = -20; alt <= 60; alt += 10) {
				for (const c of veilColour(obsc, alt)) {
					expect(c).toBeGreaterThanOrEqual(0);
					expect(c).toBeLessThanOrEqual(1);
				}
			}
		}
	});
});

describe('loupeSkyCss', () => {
	const dusk = hexToRgb(DUSK_HEX);

	it('shows the horizon glow at the horizon and the upper sky high up', () => {
		expect(loupeSkyCss(0, dusk, 0)).toBe(cssRgb(hexToRgb(SKY_PALETTE.horizon)));
		expect(loupeSkyCss(30, dusk, 0)).toBe(cssRgb(hexToRgb(SKY_PALETTE.sky)));
		expect(loupeSkyCss(60, dusk, 0)).toBe(cssRgb(hexToRgb(SKY_PALETTE.sky))); // clamped
	});

	it('blends between them across the first 30°', () => {
		const mid = parse(loupeSkyCss(15, dusk, 0));
		const lo = hexToRgb(SKY_PALETTE.horizon);
		const hi = hexToRgb(SKY_PALETTE.sky);
		for (let i = 0; i < 3; i++) {
			expect(mid[i]).toBeCloseTo((lo[i] + hi[i]) / 2, 2);
		}
	});

	it('treats a Sun below the horizon as horizon colour, not an inverted blend', () => {
		expect(loupeSkyCss(-5, dusk, 0)).toBe(loupeSkyCss(0, dusk, 0));
	});

	it('dims toward the veil as the veil takes over', () => {
		const clear = parse(loupeSkyCss(10, dusk, 0));
		const half = parse(loupeSkyCss(10, dusk, 0.5));
		const full = parse(loupeSkyCss(10, dusk, 1));
		expect(luma(half)).toBeLessThan(luma(clear));
		expect(luma(full)).toBeLessThan(luma(half));
		expect(full).toEqual(dusk.map((c) => Math.round(c * 255) / 255));
	});

	it('always returns a parseable css colour', () => {
		for (const alt of [-10, 0, 5, 30, 90]) {
			for (const op of [0, 0.3, 1]) {
				expect(loupeSkyCss(alt, veilColour(0.5, alt), op)).toMatch(/^rgb\(\d{1,3} \d{1,3} \d{1,3}\)$/);
			}
		}
	});
});

describe('loupeGroundCss', () => {
	const dusk = hexToRgb(DUSK_HEX);

	it('accepts the map style’s rgb() land colour', () => {
		// The reason toRgb01 exists: the VersaTiles style hands over `rgb(...)`, and hexToRgb alone
		// would silently read that as black.
		expect(loupeGroundCss('rgb(200, 190, 170)', dusk, 0)).toBe('rgb(200 190 170)');
		expect(loupeGroundCss('rgba(200, 190, 170, 0.8)', dusk, 0)).toBe('rgb(200 190 170)');
	});

	it('accepts a hex land colour too', () => {
		expect(loupeGroundCss('#c8beaa', dusk, 0)).toBe('rgb(200 190 170)');
	});

	it('tolerates whitespace variants from the style', () => {
		expect(loupeGroundCss('rgb(200,190,170)', dusk, 0)).toBe('rgb(200 190 170)');
		expect(loupeGroundCss('RGB( 200 , 190 , 170 )', dusk, 0)).toBe('rgb(200 190 170)');
	});

	it('dims the ground exactly as the veil dims the scene', () => {
		const land = 'rgb(200, 190, 170)';
		expect(loupeGroundCss(land, dusk, 1)).toBe(cssRgb(dusk));
		expect(luma(parse(loupeGroundCss(land, dusk, 0.5)))).toBeLessThan(luma(parse(loupeGroundCss(land, dusk, 0))));
	});

	it('keeps ground darker than sky at the same veil level', () => {
		// The loupe must read as a cutout of the scene: land below, sky above, and the horizon visible.
		const veil = veilColour(0.5, 3);
		const ground = luma(parse(loupeGroundCss('rgb(120, 110, 95)', veil, 0.4)));
		const sky = luma(parse(loupeSkyCss(3, veil, 0.4)));
		expect(ground).toBeLessThan(sky);
	});
});
