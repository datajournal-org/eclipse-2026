// Central configuration for the eclipse app — the single place to tweak the event and the animation.

/**
 * Production origin. `hreflang`, `canonical` and the Open Graph URLs are ignored by crawlers unless they
 * are absolute, so every one of them is built from this constant (plus `base` from `$app/paths`).
 */
export const SITE_URL = 'https://datajournal.org';

/** Date of the total solar eclipse. Single source of truth for the event day. */
export const ECLIPSE_DATE = '2026-08-12';

const [YEAR, MONTH, DAY] = ECLIPSE_DATE.split('-').map(Number);
/** A UTC instant on the eclipse day. */
const eclipseDayUtc = (hour: number, minute: number) => new Date(Date.UTC(YEAR, MONTH - 1, DAY, hour, minute));

/**
 * A2 shadow animation / time-slider window (UTC). The umbra only touches Earth ~17:00–18:32, so
 * frames outside that are dropped automatically (shadowCenter returns null there).
 */
export const TIMELINE_START = eclipseDayUtc(16, 45);
export const TIMELINE_END = eclipseDayUtc(18, 45);

/** Time between animation frames / slider steps (ms). */
export const FRAME_STEP_MS = 30 * 1000;

/**
 * B3 sky-view scene palette — the realistic dusk look of the horizon view.
 * These are deliberately NOT brand colours (they must not track the accent): a blue sky
 * should stay blue. Kept here as the single place to tweak the horizon rendering.
 * The Sun disc is stored as hex and converted to 0..1 rgb for the WebGL shader.
 */
export const SKY_PALETTE = {
	sky: '#8fb4e0', // upper sky
	horizon: '#f4c48a', // horizon glow
	fog: '#e6c39a', // atmospheric fog
	sun: '#ffedb8' // eclipsed Sun disc
	// note: 3D buildings inherit the map's own land/background colour (read from the style) — not set here
} as const;
