// Lightweight, dependency-free i18n: JSON message files + Svelte stores + native Intl.
import { derived, writable, type Readable } from 'svelte/store';
import { browser } from '$app/environment';
import de from './messages/de.json';
import en from './messages/en.json';
import es from './messages/es.json';

export const LOCALES = ['de', 'en', 'es'] as const;
export type Locale = (typeof LOCALES)[number];
type Messages = typeof de;

const DICTS: Record<Locale, Messages> = { de, en, es };
export const LOCALE_NAMES: Record<Locale, string> = { de: 'Deutsch', en: 'English', es: 'Español' };
const DEFAULT: Locale = 'de';

function isLocale(x: string): x is Locale {
	return (LOCALES as readonly string[]).includes(x);
}

/** Resolve a BCP-47 tag (e.g. "en-GB") to a supported locale, or null. */
function match(tag: string | null | undefined): Locale | null {
	if (!tag) return null;
	const base = tag.toLowerCase().split('-')[0];
	return isLocale(base) ? base : null;
}

/** Detect from localStorage, then browser languages, else default. */
function detect(): Locale {
	if (!browser) return DEFAULT;
	try {
		const m = match(localStorage.getItem('locale'));
		if (m) return m;
	} catch {
		/* ignore */
	}
	for (const tag of navigator.languages ?? [navigator.language]) {
		const m = match(tag);
		if (m) return m;
	}
	return DEFAULT;
}

export const locale = writable<Locale>(DEFAULT);

/** Call once on the client (in the root layout onMount). */
export function initLocale() {
	setLocale(detect());
}

export function setLocale(l: Locale) {
	if (!isLocale(l)) return;
	locale.set(l);
	if (browser) {
		try {
			localStorage.setItem('locale', l);
		} catch {
			/* ignore */
		}
		document.documentElement.lang = l;
	}
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
	num: (n: number, opts?: Intl.NumberFormatOptions) => new Intl.NumberFormat($l, opts).format(n)
}));
