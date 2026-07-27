import { describe, it, expect, beforeEach, vi } from 'vitest';
import { get } from 'svelte/store';
import { detectLocale } from './index';
import de from './messages/de';
import en from './messages/en';
import es from './messages/es';

/** Fresh module instance — `locale` is module state and `initLocale` reads the environment once. */
async function load(opts: { stored?: string | null } = {}) {
	vi.resetModules();
	localStorage.clear();
	if (opts.stored != null) localStorage.setItem('locale', opts.stored);
	return await import('./index');
}

beforeEach(() => {
	localStorage.clear();
	document.documentElement.removeAttribute('lang');
	vi.restoreAllMocks();
});

describe('detectLocale', () => {
	// The URL owns the language now; this function only decides where the bare ROOT sends a reader.
	it('prefers a stored choice over the browser languages', () => {
		expect(detectLocale('es', ['en-GB', 'de'])).toBe('es');
	});

	it('falls back to the browser languages in order', () => {
		expect(detectLocale(null, ['en-GB', 'de'])).toBe('en');
		expect(detectLocale(null, ['de-AT', 'en'])).toBe('de');
	});

	it('resolves a regional tag to its base language', () => {
		expect(detectLocale(null, ['es-419'])).toBe('es');
	});

	it('skips languages we do not have', () => {
		expect(detectLocale(null, ['fr-FR', 'it', 'es-ES'])).toBe('es');
	});

	it('falls back to English when nothing matches', () => {
		// English, not German: the root is the international entry point.
		expect(detectLocale(null, ['fr-FR', 'ja'])).toBe('en');
		expect(detectLocale(null, [])).toBe('en');
	});

	it('ignores a stored language we no longer support', () => {
		expect(detectLocale('fr', ['de'])).toBe('de');
	});
});

describe('applyLocale', () => {
	it('mirrors the route language into the store', async () => {
		const { locale, applyLocale } = await load();
		applyLocale('es');
		expect(get(locale)).toBe('es');
	});

	it('remembers it for the next visit to the root', async () => {
		const { applyLocale } = await load();
		applyLocale('en');
		expect(localStorage.getItem('locale')).toBe('en');
	});

	it('keeps <html lang> in step after a client-side navigation', async () => {
		// The server hook only runs at prerender time, so this is what fixes the attribute on a switch.
		const { applyLocale } = await load();
		applyLocale('es');
		expect(document.documentElement.lang).toBe('es');
	});

	it('ignores an unknown tag rather than blanking the UI', async () => {
		const { locale, applyLocale } = await load();
		applyLocale('fr' as 'de');
		expect(get(locale)).toBe('en');
		expect(localStorage.getItem('locale')).toBeNull();
	});

	it('survives a localStorage that throws on write', async () => {
		const { locale, applyLocale } = await load();
		vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
			throw new DOMException('QuotaExceededError');
		});
		expect(() => applyLocale('en')).not.toThrow();
		expect(get(locale)).toBe('en');
		expect(document.documentElement.lang).toBe('en');
	});
});

describe('t', () => {
	it('translates in the active locale', async () => {
		const { t, applyLocale: setLocale } = await load();
		setLocale('de');
		expect(get(t)('a2.title')).toBe('Schattenlauf');
		setLocale('en');
		expect(get(t)('a2.title')).toBe(en.a2.title);
		setLocale('es');
		expect(get(t)('a2.title')).toBe(es.a2.title);
	});

	it('reads nested keys by dotted path', async () => {
		const { t } = await load();
		expect(get(t)('app.title')).toBe('Eclipse 2026');
	});

	it('interpolates parameters', async () => {
		const { t } = await load();
		const rendered = get(t)('b1.max_at', { time: '20:08', zone: 'MESZ' });
		expect(rendered).not.toContain('{time}');
		expect(rendered).toContain('20:08');
	});

	it('replaces every occurrence of a placeholder', async () => {
		const { t } = await load();
		// replaceAll, not replace — a template using {pct} twice must not keep a stray brace.
		for (const key of allKeys(de)) {
			const raw = lookup(de, key)!;
			if (!raw.includes('{')) continue;
			const params = Object.fromEntries([...raw.matchAll(/{(\w+)}/g)].map((m) => [m[1], 'X']));
			expect(get(t)(key, params), key).not.toMatch(/[{}]/);
		}
	});

	it('returns the key itself for a missing message', async () => {
		// Better a visible key than `undefined` splashed across the UI.
		const { t } = await load();
		expect(get(t)('nope.not.here')).toBe('nope.not.here');
	});

	it('does not mistake a nested object for a string', async () => {
		const { t } = await load();
		expect(get(t)('a2')).toBe('a2');
	});

	it('is reactive: the same $t call re-renders after a locale switch', async () => {
		const { t, applyLocale: setLocale } = await load();
		const seen: string[] = [];
		setLocale('de');
		const unsub = t.subscribe((translate) => seen.push(translate('a2.title')));
		setLocale('en');
		unsub();
		expect(seen).toEqual(['Schattenlauf', en.a2.title]);
	});
});

describe('message catalogues', () => {
	// One test that prevents most i18n bugs: the three files must stay structurally identical.
	const catalogues = { de, en, es } as const;

	it('define the same set of keys', () => {
		const reference = allKeys(de).sort();
		for (const [name, dict] of Object.entries(catalogues)) {
			expect(allKeys(dict).sort(), name).toEqual(reference);
		}
	});

	it('have no empty strings', () => {
		for (const [name, dict] of Object.entries(catalogues)) {
			for (const key of allKeys(dict)) expect(lookup(dict, key)!.trim(), `${name}.${key}`).not.toBe('');
		}
	});

	it('use the same placeholders per key', () => {
		// A translator dropping {time} silently produces a sentence with a hole in it.
		const placeholders = (s: string) => [...s.matchAll(/{(\w+)}/g)].map((m) => m[1]).sort();
		for (const key of allKeys(de)) {
			const reference = placeholders(lookup(de, key)!);
			for (const [name, dict] of Object.entries(catalogues)) {
				expect(placeholders(lookup(dict, key)!), `${name}.${key}`).toEqual(reference);
			}
		}
	});

	it('keep the brand name identical across locales', () => {
		for (const dict of Object.values(catalogues)) expect(lookup(dict, 'app.title')).toBe('Eclipse 2026');
	});

	it('list every supported locale with a display name', async () => {
		const { LOCALES, LOCALE_NAMES } = await load();
		expect([...LOCALES].sort()).toEqual(Object.keys(catalogues).sort());
		for (const l of LOCALES) expect(LOCALE_NAMES[l]).toBeTruthy();
	});
});

describe('fmt', () => {
	const instant = new Date('2026-08-12T18:08:00Z');

	it('formats times in the active locale', async () => {
		const { fmt, applyLocale: setLocale } = await load();
		setLocale('de');
		expect(get(fmt).time(instant)).toMatch(/\d{2}:\d{2}/);
		setLocale('en');
		expect(get(fmt).time(instant)).toMatch(/\d{1,2}:\d{2}/);
	});

	it('formats dates differently per locale', async () => {
		const { fmt, applyLocale: setLocale } = await load();
		setLocale('de');
		const german = get(fmt).date(instant);
		setLocale('en');
		const english = get(fmt).date(instant);
		expect(german).not.toBe(english);
		expect(german).toContain('2026');
		expect(english).toContain('2026');
	});

	it('formats numbers with locale separators', async () => {
		const { fmt, applyLocale: setLocale } = await load();
		setLocale('de');
		expect(get(fmt).num(1234.5)).toBe('1.234,5');
		setLocale('en');
		expect(get(fmt).num(1234.5)).toBe('1,234.5');
	});

	it('passes Intl options through', async () => {
		const { fmt, applyLocale } = await load();
		applyLocale('de');
		expect(get(fmt).num(0.848, { style: 'percent', maximumFractionDigits: 1 })).toContain('84,8');
	});

	it('names the time zone', async () => {
		// The suite pins TZ=Europe/Berlin (see the test:unit script). Without that this asserted whatever
		// the machine happened to be set to: it passed locally and failed on CI, where runners are UTC and
		// the IANA name has no "Region/City" form at all.
		const { fmt } = await load();
		expect(get(fmt).zone(instant)).toBeTruthy();
		expect(get(fmt).zoneName()).toBe('Europe/Berlin');
	});

	it('accepts a timestamp as well as a Date', async () => {
		const { fmt } = await load();
		expect(get(fmt).time(instant.getTime())).toBe(get(fmt).time(instant));
	});
});

// --- helpers ---

function allKeys(dict: unknown, prefix = ''): string[] {
	if (typeof dict !== 'object' || dict === null) return [];
	return Object.entries(dict).flatMap(([k, v]) =>
		typeof v === 'string' ? [`${prefix}${k}`] : allKeys(v, `${prefix}${k}.`)
	);
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
