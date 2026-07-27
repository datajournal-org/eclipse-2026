import { describe, it, expect, vi, afterEach } from 'vitest';
import { get } from 'svelte/store';
import { now, pad2, splitDuration } from './now';

describe('pad2', () => {
	it('pads single digits', () => {
		expect(pad2(0)).toBe('00');
		expect(pad2(7)).toBe('07');
		expect(pad2(9)).toBe('09');
	});

	it('leaves two digits alone', () => {
		expect(pad2(10)).toBe('10');
		expect(pad2(59)).toBe('59');
	});

	it('does not truncate three digits', () => {
		// A countdown of 100+ days must read "100", not "10".
		expect(pad2(100)).toBe('100');
	});
});

describe('splitDuration', () => {
	it('is all zeroes at zero', () => {
		expect(splitDuration(0)).toEqual({ d: 0, h: 0, m: 0, s: 0 });
	});

	it('floors sub-second remainders', () => {
		expect(splitDuration(999)).toEqual({ d: 0, h: 0, m: 0, s: 0 });
		expect(splitDuration(1000)).toEqual({ d: 0, h: 0, m: 0, s: 1 });
		expect(splitDuration(1999)).toEqual({ d: 0, h: 0, m: 0, s: 1 });
	});

	it('rolls over at each unit boundary', () => {
		expect(splitDuration(59_000)).toEqual({ d: 0, h: 0, m: 0, s: 59 });
		expect(splitDuration(60_000)).toEqual({ d: 0, h: 0, m: 1, s: 0 });
		expect(splitDuration(3_600_000)).toEqual({ d: 0, h: 1, m: 0, s: 0 });
		expect(splitDuration(86_400_000)).toEqual({ d: 1, h: 0, m: 0, s: 0 });
	});

	it('carries hours past a day rather than reporting 25 h', () => {
		expect(splitDuration(25 * 3_600_000)).toEqual({ d: 1, h: 1, m: 0, s: 0 });
	});

	it('splits a realistic countdown', () => {
		const ms = 16 * 86_400_000 + 5 * 3_600_000 + 43 * 60_000 + 9_000;
		expect(splitDuration(ms)).toEqual({ d: 16, h: 5, m: 43, s: 9 });
	});

	it('clamps a negative duration to zero', () => {
		// After the eclipse the countdown goes negative; it must read 00:00:00, not count upward.
		expect(splitDuration(-1)).toEqual({ d: 0, h: 0, m: 0, s: 0 });
		expect(splitDuration(-86_400_000)).toEqual({ d: 0, h: 0, m: 0, s: 0 });
	});

	it('reassembles to the original whole seconds', () => {
		for (const ms of [0, 1234, 987_654, 86_400_000, 1_234_567_890]) {
			const { d, h, m, s } = splitDuration(ms);
			expect(((d * 24 + h) * 60 + m) * 60 + s).toBe(Math.floor(ms / 1000));
		}
	});
});

describe('now', () => {
	afterEach(() => {
		vi.useRealTimers();
		vi.restoreAllMocks();
	});

	it('reports the wall clock as soon as it is read', () => {
		// `get` subscribes and immediately unsubscribes, which is enough to run the start function —
		// so a one-off read gets a real timestamp rather than the 0 the store is declared with.
		expect(Math.abs(get(now) - Date.now())).toBeLessThan(1000);
	});

	it('emits the current time immediately on subscribe', () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date('2026-08-12T17:45:00Z'));
		let value = 0;
		const unsub = now.subscribe((v) => (value = v));
		expect(value).toBe(Date.parse('2026-08-12T17:45:00Z'));
		unsub();
	});

	it('ticks once per second', () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date('2026-08-12T17:45:00Z'));
		const seen: number[] = [];
		const unsub = now.subscribe((v) => seen.push(v));

		vi.advanceTimersByTime(2500);
		unsub();

		expect(seen).toHaveLength(3); // initial + two ticks
		expect(seen[1] - seen[0]).toBe(1000);
		expect(seen[2] - seen[1]).toBe(1000);
	});

	it('stops the interval on the last unsubscribe', () => {
		// A leaked 1 s interval per mounted countdown is exactly what this single shared store avoids.
		vi.useFakeTimers();
		const clear = vi.spyOn(globalThis, 'clearInterval');
		const unsub = now.subscribe(() => {});
		unsub();
		expect(clear).toHaveBeenCalled();

		const seen: number[] = [];
		const unsub2 = now.subscribe((v) => seen.push(v));
		vi.advanceTimersByTime(3000);
		unsub2();
		expect(seen).toHaveLength(4); // a fresh subscription restarts cleanly
	});

	it('shares one interval between concurrent subscribers', () => {
		vi.useFakeTimers();
		const setSpy = vi.spyOn(globalThis, 'setInterval');
		const a = now.subscribe(() => {});
		const b = now.subscribe(() => {});
		expect(setSpy).toHaveBeenCalledTimes(1);
		a();
		b();
	});
});
