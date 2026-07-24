// Central configuration for the eclipse app — the single place to tweak the event and the animation.

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
