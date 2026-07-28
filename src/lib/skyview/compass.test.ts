import { describe, it, expect } from 'vitest';
import { CARDINAL_KEYS, cardinalKey, compassTicks, LABEL_ALT } from './compass';

describe('cardinalKey', () => {
	it('maps the eight exact points to themselves', () => {
		for (let i = 0; i < 8; i++) expect(cardinalKey(i * 45)).toBe(CARDINAL_KEYS[i]);
	});

	it('assigns each azimuth to its nearest point, splitting at 22.5°', () => {
		expect(cardinalKey(22.4)).toBe('n');
		expect(cardinalKey(22.6)).toBe('ne');
		expect(cardinalKey(337.4)).toBe('nw');
		expect(cardinalKey(337.6)).toBe('n');
		// The Sun over the 2026 window: Oviedo's maximum is at ~267°, squarely west.
		expect(cardinalKey(267)).toBe('w');
	});

	it('is wrap-safe, including negatives', () => {
		expect(cardinalKey(360)).toBe('n');
		expect(cardinalKey(720 + 90)).toBe('e');
		expect(cardinalKey(-45)).toBe('nw');
		expect(cardinalKey(-360)).toBe('n');
	});
});

describe('compassTicks', () => {
	it('covers the full horizon at 5° spacing', () => {
		const ticks = compassTicks();
		expect(ticks).toHaveLength(72);
		expect(new Set(ticks.map((t) => t.az)).size).toBe(72);
		for (const t of ticks) expect(t.az % 5).toBe(0);
	});

	it('grades the heights: compass points over 15° marks over minor ticks', () => {
		const ticks = compassTicks();
		const at = (az: number) => ticks.find((t) => t.az === az)!.top;
		expect(at(0)).toBeGreaterThan(at(15)); // a compass point outranks a 15° mark...
		expect(at(15)).toBeGreaterThan(at(5)); // ...which outranks a minor tick
		// and every azimuth of the same rank gets the same height
		for (const t of ticks) {
			expect(t.top).toBe(t.az % 45 === 0 ? at(0) : t.az % 15 === 0 ? at(15) : at(5));
		}
	});

	it('stays below the label line, so letters never sit on their own tick', () => {
		for (const t of compassTicks()) expect(t.top).toBeLessThan(LABEL_ALT);
	});
});
