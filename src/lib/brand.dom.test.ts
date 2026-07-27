import { describe, it, expect, afterEach } from 'vitest';
import { hexToRgb, readBrandColors } from './brand';

describe('hexToRgb', () => {
	it('expands the three-digit form', () => {
		expect(hexToRgb('#fff')).toEqual([1, 1, 1]);
		expect(hexToRgb('#000')).toEqual([0, 0, 0]);
		expect(hexToRgb('#f00')).toEqual([1, 0, 0]);
		// #abc → #aabbcc
		expect(hexToRgb('#abc')).toEqual(hexToRgb('#aabbcc'));
	});

	it('reads the six-digit form', () => {
		expect(hexToRgb('#ff8000')).toEqual([1, 128 / 255, 0]);
		expect(hexToRgb('#0080ff')).toEqual([0, 128 / 255, 1]);
	});

	it('is case-insensitive', () => {
		expect(hexToRgb('#AABBCC')).toEqual(hexToRgb('#aabbcc'));
	});

	it('accepts a missing leading hash', () => {
		expect(hexToRgb('aabbcc')).toEqual(hexToRgb('#aabbcc'));
	});

	it('normalises every component into 0..1', () => {
		for (const hex of ['#000000', '#ffffff', '#123456', '#fedcba']) {
			for (const c of hexToRgb(hex)) {
				expect(c).toBeGreaterThanOrEqual(0);
				expect(c).toBeLessThanOrEqual(1);
			}
		}
	});

	it('does not throw on unparseable input', () => {
		// A malformed token must not take the WebGL layers down with it; NaN components are the
		// documented consequence of garbage in, and the caller (readBrandColors) rejects empty tokens.
		expect(() => hexToRgb('not-a-colour')).not.toThrow();
	});
});

describe('readBrandColors', () => {
	const root = document.documentElement;
	afterEach(() => root.removeAttribute('style'));

	const setTokens = (tokens: Record<string, string>) => {
		for (const [k, v] of Object.entries(tokens)) root.style.setProperty(k, v);
	};

	it('reads the three brand tokens off :root', () => {
		setTokens({ '--bg': '#0b1020', '--accent': '#ffb703', '--accent-2': '#8ecae6' });
		const brand = readBrandColors();
		expect(brand.bg.hex).toBe('#0b1020');
		expect(brand.accent.hex).toBe('#ffb703');
		expect(brand.accent2.hex).toBe('#8ecae6');
		expect(brand.accent.rgb).toEqual(hexToRgb('#ffb703'));
	});

	it('trims whitespace around a token value', () => {
		setTokens({ '--bg': '  #101010  ', '--accent': '#ffffff', '--accent-2': '#000000' });
		expect(readBrandColors().bg.hex).toBe('#101010');
	});

	it('throws a named error when a token is missing', () => {
		// Better a loud failure at startup than a black canvas nobody can explain.
		setTokens({ '--bg': '#0b1020', '--accent': '#ffb703' });
		expect(() => readBrandColors()).toThrow(/--accent-2/);
	});

	it('throws when a token is still an unresolved var()', () => {
		setTokens({ '--bg': 'var(--missing)', '--accent': '#ffb703', '--accent-2': '#8ecae6' });
		expect(() => readBrandColors()).toThrow(/--bg/);
	});
});
