// Lightweight, dependency-free i18n: JSON message files + Svelte stores + native Intl.
import { derived, writable } from 'svelte/store';
import { browser } from '$app/environment';
import de from './messages/de.json';
import en from './messages/en.json';
import es from './messages/es.json';

const DICTS = { de, en, es };
export const LOCALES = /** @type {const} */ (['de', 'en', 'es']);
export const LOCALE_NAMES = { de: 'Deutsch', en: 'English', es: 'Español' };
const DEFAULT = 'de';

/** Resolve a BCP-47 tag (e.g. "en-GB") to a supported locale, or null. */
function match(tag) {
  if (!tag) return null;
  const base = tag.toLowerCase().split('-')[0];
  return LOCALES.includes(base) ? base : null;
}

/** Detect from localStorage, then browser languages, else default. */
function detect() {
  if (!browser) return DEFAULT;
  try {
    const saved = localStorage.getItem('locale');
    if (match(saved)) return match(saved);
  } catch { /* ignore */ }
  for (const tag of navigator.languages ?? [navigator.language]) {
    const m = match(tag);
    if (m) return m;
  }
  return DEFAULT;
}

export const locale = writable(DEFAULT);

/** Call once on the client (in the root layout onMount). */
export function initLocale() {
  setLocale(detect());
}

export function setLocale(l) {
  if (!LOCALES.includes(l)) return;
  locale.set(l);
  if (browser) {
    try { localStorage.setItem('locale', l); } catch { /* ignore */ }
    document.documentElement.lang = l;
  }
}

function lookup(dict, key) {
  return key.split('.').reduce((o, k) => (o == null ? undefined : o[k]), dict);
}

/** Reactive translator: $t('a2.title'), $t('key', { name: 'x' }). */
export const t = derived(locale, ($l) => {
  /** @param {string} key @param {Record<string, string|number>} [params] */
  return (key, params) => {
    let s = lookup(DICTS[$l], key);
    if (s == null) s = lookup(DICTS.en, key);
    if (s == null) return key;
    if (params) for (const [k, v] of Object.entries(params)) s = s.replaceAll(`{${k}}`, String(v));
    return s;
  };
});

/** Reactive Intl formatters bound to the current locale. */
export const fmt = derived(locale, ($l) => ({
  time: (d, opts) => new Intl.DateTimeFormat($l, { hour: '2-digit', minute: '2-digit', ...opts }).format(d),
  date: (d, opts) => new Intl.DateTimeFormat($l, { dateStyle: 'long', ...opts }).format(d),
  num: (n, opts) => new Intl.NumberFormat($l, opts).format(n)
}));
