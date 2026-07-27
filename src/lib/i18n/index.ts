// Lightweight, dependency-free i18n: typed message modules + Svelte stores + native Intl.
import { derived, writable, type Readable } from 'svelte/store';
import { browser } from '$app/environment';
import de, { type Messages } from './messages/de';
import en from './messages/en';
import es from './messages/es';

export const LOCALES = ['de', 'en', 'es'] as const;
export type Locale = (typeof LOCALES)[number];

const DICTS: Record<Locale, Messages> = { de, en, es };
export const LOCALE_NAMES: Record<Locale, string> = { de: 'Deutsch', en: 'English', es: 'Español' };

/**
 * The language the bare root (`/eclipse-2026/`) serves, and the fallback for any reader whose language
 * we do not have. English, because the root is the international entry point — see docs/I18N-ROUTING.md.
 */
export const DEFAULT_LOCALE: Locale = 'en';

/** Open Graph wants full territory codes, not the bare language tags used in the URLs. */
export const OG_LOCALE: Record<Locale, string> = { de: 'de_DE', en: 'en_GB', es: 'es_ES' };

export function isLocale(x: string | null | undefined): x is Locale {
	return !!x && (LOCALES as readonly string[]).includes(x);
}

/** Resolve a BCP-47 tag (e.g. "en-GB") to a supported locale, or null. */
export function match(tag: string | null | undefined): Locale | null {
	if (!tag) return null;
	const base = tag.toLowerCase().split('-')[0];
	return isLocale(base) ? base : null;
}

/**
 * Pick a language for a reader with no language in the URL: their stored choice first, then their
 * browser's preference order, else the default.
 *
 * Kept pure and exported because the redirect that actually uses it runs as an inline script in
 * app.html — before the bundle loads — and this is the version the tests exercise. The two are held in
 * step by a test that reads app.html and checks the language list matches LOCALES.
 */
export function detectLocale(stored: string | null | undefined, languages: readonly string[]): Locale {
	return match(stored) ?? languages.map(match).find(Boolean) ?? DEFAULT_LOCALE;
}

/**
 * The active language. The URL owns it — the layout sets this from the route parameter on every
 * navigation — so this store is a read-mostly mirror rather than the source of truth.
 */
export const locale = writable<Locale>(DEFAULT_LOCALE);

/**
 * Mirror the route's language into the store, remember it for the next visit to the bare root, and keep
 * <html lang> in step (the server hook only runs at prerender time, not on a client-side navigation).
 */
export function applyLocale(l: Locale) {
	if (!isLocale(l)) return;
	locale.set(l);
	if (!browser) return;
	try {
		localStorage.setItem('locale', l);
	} catch {
		/* ignore — Safari private mode */
	}
	document.documentElement.lang = l;
}

function lookup(dict: unknown, key: string): string | undefined {
	const value = key
		.split('.')
		.reduce<unknown>(
			(o, k) => (o != null && typeof o === 'object' ? (o as Record<string, unknown>)[k] : undefined),
			dict
		);
	return typeof value === 'string' ? value : undefined;
}

export type Translate = (key: string, params?: Record<string, string | number>) => string;

/** Reactive translator: $t('a2.title'), $t('key', { name: 'x' }). */
export const t: Readable<Translate> = derived(locale, ($l) => {
	return (key: string, params?: Record<string, string | number>) => {
		let s = lookup(DICTS[$l], key) ?? lookup(DICTS.en, key);
		if (s == null) return key;
		if (params) for (const [k, v] of Object.entries(params)) s = s.replaceAll(`{${k}}`, String(v));
		return s;
	};
});

/** Reactive Intl formatters bound to the current locale. */
export const fmt = derived(locale, ($l) => ({
	time: (d: Date | number, opts?: Intl.DateTimeFormatOptions) =>
		new Intl.DateTimeFormat($l, { hour: '2-digit', minute: '2-digit', ...opts }).format(d),
	date: (d: Date | number, opts?: Intl.DateTimeFormatOptions) =>
		new Intl.DateTimeFormat($l, { dateStyle: 'long', ...opts }).format(d),
	num: (n: number, opts?: Intl.NumberFormatOptions) => new Intl.NumberFormat($l, opts).format(n),
	/** Short name of the browser's time zone at the given instant, e.g. "MESZ" / "GMT+2" (summer vs winter aware). */
	zone: (d: Date | number) =>
		new Intl.DateTimeFormat($l, { timeZoneName: 'short', hour: '2-digit' })
			.formatToParts(d)
			.find((p) => p.type === 'timeZoneName')?.value ?? '',
	/** The IANA time-zone name resolved from the browser, e.g. "Europe/Berlin". */
	zoneName: () => Intl.DateTimeFormat().resolvedOptions().timeZone
}));
