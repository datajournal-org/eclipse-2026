// Central configuration for the eclipse app — the single place to tweak the event and the animation.

/**
 * Production origin. `hreflang`, `canonical` and the Open Graph URLs are ignored by crawlers unless they
 * are absolute, so every one of them is built from this constant (plus `base` from `$app/paths`).
 *
 * Overridable at build time with `VITE_SITE_URL`, so a deployment to somewhere other than the primary
 * host advertises its own URLs rather than pointing every canonical tag at a site it is not.
 */
// Optional chaining is load-bearing: this module is also imported by scripts/build-corridor.ts, which
// runs under plain Node via tsx, where `import.meta.env` does not exist at all.
export const SITE_URL: string = import.meta.env?.VITE_SITE_URL ?? 'https://datajournal.org';

/**
 * The public source repository. Unlike SITE_URL this is NOT build-overridable: it names where the code
 * lives, which does not change with the deployment target — any alternate host and the CDN copy are
 * built from the same repo and should both credit it.
 */
export const REPO_URL = 'https://github.com/datajournal-org/eclipse-2026';

/** Imprint (Impressum) of datajournal.org, the site this app is published under — legally required. */
export const IMPRINT_URL = 'https://datajournal.org/impressum';

/**
 * The tip jar (Stripe LIVE payment link) behind the donate box at the end of the page.
 * Mirrored in tests/donate.spec.ts, which pins the exact URL the page ships.
 */
export const DONATE_URL = 'https://donate.stripe.com/00w6oJ3EMfca6J35Jb1ck00';

/**
 * Where a locale's message catalogue lives, so the footer can send a reader straight to the file that
 * holds the words they are reading. Points at `main` rather than a commit: the invitation is to improve
 * the current translation, not to inspect the deployed one.
 */
export const translationFileUrl = (locale: string) => `${REPO_URL}/blob/main/src/lib/i18n/messages/${locale}.ts`;

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
	sun: '#ffedb8', // eclipsed Sun disc
	star: '#ffffff' // stars and planets during totality — near-white, as the eye sees them
	// note: 3D buildings inherit the map's own land/background colour (read from the style) — not set here
} as const;
