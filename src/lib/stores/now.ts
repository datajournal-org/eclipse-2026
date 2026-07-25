// One app-wide clock: a single 1-second interval feeding a readable store, instead of each countdown
// component running its own timer. The interval only runs while something is subscribed (Svelte starts
// it on the first subscriber and clears it on the last). SSR-safe: stays 0 on the server.
import { readable } from 'svelte/store';
import { browser } from '$app/environment';

/** Current epoch milliseconds, updated every second on the client. 0 during SSR / before hydration. */
export const now = readable(0, (set) => {
	if (!browser) return;
	set(Date.now());
	const id = setInterval(() => set(Date.now()), 1000);
	return () => clearInterval(id);
});

/** Zero-pad an integer to two digits (e.g. 7 → "07"). */
export const pad2 = (n: number): string => String(n).padStart(2, '0');

/** Split a duration in milliseconds into whole days / hours / minutes / seconds (clamped at 0). */
export function splitDuration(ms: number): { d: number; h: number; m: number; s: number } {
	const s = Math.max(0, Math.floor(ms / 1000));
	return {
		d: Math.floor(s / 86400),
		h: Math.floor((s % 86400) / 3600),
		m: Math.floor((s % 3600) / 60),
		s: s % 60
	};
}
