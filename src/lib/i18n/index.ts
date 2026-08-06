// Lightweight, dependency-free i18n: typed message modules + Svelte stores + native Intl.
import { derived, writable, type Readable } from 'svelte/store';
import { browser } from '$app/environment';
import de, { type Messages } from './messages/de';
import en from './messages/en';
import es from './messages/es';
import fr from './messages/fr';
import nl from './messages/nl';
import pt from './messages/pt';

type LocaleSpec = {
	dict: Messages;
	/** The language's own name for itself — what its link in the header and on the root page says. */
	name: string;
	/** Open Graph territory code (og:locale wants full codes, not the bare tags used in the URLs). */
	og: string;
};

/**
 * THE language registry — one entry per supported language, everything else (LOCALES, names, OG codes,
 * the translator's dictionaries) is derived from it. Adding a language means: one entry here, its
 * message file, the inline-dispatch copy in app.html (physically cannot import this module; a test keeps
 * it in step), and the deliberately independent expectation pins in the test suite.
 *
 * Entry order is display order: the header switcher and the root page render languages as listed here.
 */
const REGISTRY = {
	de: { dict: de, name: 'Deutsch', og: 'de_DE' },
	en: { dict: en, name: 'English', og: 'en_GB' },
	es: { dict: es, name: 'Español', og: 'es_ES' },
	fr: { dict: fr, name: 'Français', og: 'fr_FR' },
	nl: { dict: nl, name: 'Nederlands', og: 'nl_NL' },
	pt: { dict: pt, name: 'Português', og: 'pt_PT' }
} satisfies Record<string, LocaleSpec>;

export type Locale = keyof typeof REGISTRY;
export const LOCALES = Object.keys(REGISTRY) as readonly Locale[];

const derive = <V>(pick: (spec: LocaleSpec) => V): Record<Locale, V> =>
	Object.fromEntries(LOCALES.map((l) => [l, pick(REGISTRY[l])])) as Record<Locale, V>;

const DICTS: Record<Locale, Messages> = derive((spec) => spec.dict);
export const LOCALE_NAMES: Record<Locale, string> = derive((spec) => spec.name);

/**
 * The language the bare root (`/eclipse-2026/`) serves, and the fallback for any reader whose language
 * we do not have. English, because the root is the international entry point — see docs/I18N-ROUTING.md.
 */
export const DEFAULT_LOCALE: Locale = 'en';

/** Open Graph wants full territory codes, not the bare language tags used in the URLs. */
export const OG_LOCALE: Record<Locale, string> = derive((spec) => spec.og);

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

// `numeric` hour, not `2-digit`: a padded hour is wrong in English ("07:30 AM" reads as a timetable,
// not a clock) and unidiomatic in German and Spanish too. Each locale keeps its own 12/24-hour
// convention — only the padding goes. Minutes stay `2-digit`, which every locale wants.
const TIME_OPTS: Intl.DateTimeFormatOptions = { hour: 'numeric', minute: '2-digit' };
const DATE_OPTS: Intl.DateTimeFormatOptions = { dateStyle: 'long' };

/**
 * Reactive Intl formatters bound to the current locale.
 *
 * The formatters are built ONCE per locale, not once per call. `time` runs on every animation frame
 * while B3 is being scrubbed, and `new Intl.DateTimeFormat` is one of the most expensive constructors
 * the platform has: a profiled scrub on a throttled CPU spent 2.6 % of ALL script time inside it, for
 * output that only changes once a minute. The `opts` argument still works — it just falls back to a
 * one-off formatter, which no per-frame path uses.
 */
export const fmt = derived(locale, ($l) => {
	const timeFmt = new Intl.DateTimeFormat($l, TIME_OPTS);
	const dateFmt = new Intl.DateTimeFormat($l, DATE_OPTS);
	const numFmt = new Intl.NumberFormat($l);
	const zoneFmt = new Intl.DateTimeFormat($l, { timeZoneName: 'short', hour: '2-digit' });

	return {
		time: (d: Date | number, opts?: Intl.DateTimeFormatOptions) =>
			(opts ? new Intl.DateTimeFormat($l, { ...TIME_OPTS, ...opts }) : timeFmt).format(d),
		date: (d: Date | number, opts?: Intl.DateTimeFormatOptions) =>
			(opts ? new Intl.DateTimeFormat($l, { ...DATE_OPTS, ...opts }) : dateFmt).format(d),
		num: (n: number, opts?: Intl.NumberFormatOptions) => (opts ? new Intl.NumberFormat($l, opts) : numFmt).format(n),
		/** Short name of the browser's time zone at the given instant, e.g. "MESZ" / "GMT+2" (summer vs winter aware). */
		zone: (d: Date | number) => zoneFmt.formatToParts(d).find((p) => p.type === 'timeZoneName')?.value ?? '',
		/** The IANA time-zone name resolved from the browser, e.g. "Europe/Berlin". */
		zoneName: () => Intl.DateTimeFormat().resolvedOptions().timeZone,
		/**
		 * Width, in `ch`, of the widest clock string a set of instants can produce — for the `--clock-ch`
		 * custom property that stops a readout shifting when the hour gains a digit (see `.clock` in
		 * base.css). Samples rather than formats every frame: the length only changes with the hour's digit
		 * count and the AM/PM marker, so a dozen probes across the window cannot miss a case.
		 */
		clockWidthCh: (instants: readonly (Date | number)[], samples = 12) => {
			if (instants.length === 0) return '0';
			let widest = 0;
			const step = Math.max(1, Math.floor(instants.length / samples));
			for (let i = 0; i < instants.length; i += step) widest = Math.max(widest, timeFmt.format(instants[i]).length);
			widest = Math.max(widest, timeFmt.format(instants[instants.length - 1]).length);
			return `${widest}ch`;
		}
	};
});
