import { describe, it, expect } from 'vitest';
import {
	ECLIPSE_DATE,
	TIMELINE_START,
	TIMELINE_END,
	FRAME_STEP_MS,
	SKY_PALETTE,
	DONATE_URL,
	donateUrl
} from './config';
import { hexToRgb } from './brand';
import { LOCALES } from './i18n';

describe('ECLIPSE_DATE', () => {
	it('is the 2026-08-12 eclipse', () => {
		expect(ECLIPSE_DATE).toBe('2026-08-12');
	});

	it('parses as a valid UTC day', () => {
		const d = new Date(ECLIPSE_DATE + 'T00:00:00Z');
		expect(Number.isNaN(d.getTime())).toBe(false);
		expect(d.toISOString().slice(0, 10)).toBe(ECLIPSE_DATE);
	});
});

describe('animation window', () => {
	it('spans 16:45–18:45 UTC on eclipse day', () => {
		expect(TIMELINE_START.toISOString()).toBe('2026-08-12T16:45:00.000Z');
		expect(TIMELINE_END.toISOString()).toBe('2026-08-12T18:45:00.000Z');
	});

	it('starts on the eclipse day', () => {
		expect(TIMELINE_START.toISOString().slice(0, 10)).toBe(ECLIPSE_DATE);
		expect(TIMELINE_END.toISOString().slice(0, 10)).toBe(ECLIPSE_DATE);
	});

	it('is two hours long', () => {
		expect(TIMELINE_END.getTime() - TIMELINE_START.getTime()).toBe(2 * 60 * 60 * 1000);
	});

	it('divides into whole frames', () => {
		// A fractional frame count shifts every slider label and leaves the last frame unreachable.
		const span = TIMELINE_END.getTime() - TIMELINE_START.getTime();
		expect(span % FRAME_STEP_MS).toBe(0);
		expect(span / FRAME_STEP_MS).toBe(240);
	});

	it('contains the greatest eclipse with margin on both sides', () => {
		const greatest = Date.parse('2026-08-12T17:45:46Z');
		expect(greatest - TIMELINE_START.getTime()).toBeGreaterThan(30 * 60 * 1000);
		expect(TIMELINE_END.getTime() - greatest).toBeGreaterThan(30 * 60 * 1000);
	});
});

describe('donateUrl', () => {
	it('tags the payment link with this project and the page language', () => {
		expect(donateUrl('de')).toBe(`${DONATE_URL}?client_reference_id=eclipse-2026-de`);
	});

	it('stays within what Stripe accepts, for every locale we ship', () => {
		// Stripe allows alphanumerics, hyphens and underscores up to 200 characters — and DROPS an
		// invalid client_reference_id silently, leaving a working payment page with no attribution and
		// nothing to notice. A locale tag that is not URL-plain (say `sr@latin`) has to fail here
		// instead, which is the whole point of walking LOCALES rather than pinning one string.
		for (const l of LOCALES) {
			const id = new URL(donateUrl(l)).searchParams.get('client_reference_id');
			expect(id, l).toMatch(/^[A-Za-z0-9_-]{1,200}$/);
			expect(id, l).toBe(`eclipse-2026-${l}`);
		}
	});
});

describe('SKY_PALETTE', () => {
	it('is made of parseable hex colours', () => {
		for (const [name, hex] of Object.entries(SKY_PALETTE)) {
			expect(hex, name).toMatch(/^#[0-9a-f]{6}$/i);
			for (const c of hexToRgb(hex)) {
				expect(c).toBeGreaterThanOrEqual(0);
				expect(c).toBeLessThanOrEqual(1);
			}
		}
	});

	it('keeps the sky bluish and the horizon warm', () => {
		// The palette is deliberately not brand-driven (see config.ts) — this pins the intent, so a
		// well-meaning "let's use the accent colour" edit fails loudly.
		const [skyR, , skyB] = hexToRgb(SKY_PALETTE.sky);
		expect(skyB).toBeGreaterThan(skyR);
		const [horR, , horB] = hexToRgb(SKY_PALETTE.horizon);
		expect(horR).toBeGreaterThan(horB);
	});
});
