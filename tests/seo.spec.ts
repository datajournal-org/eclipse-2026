import { test, expect, BASE } from './fixtures';
import { SITE_URL } from '../src/lib/config';

/**
 * Every assertion here runs against the RAW prerendered HTML, never the live DOM. A DOM assertion would
 * pass even if the tags only appeared after hydration — which is exactly what a crawler cannot see, and
 * the whole reason these pages exist per language.
 */
// Imported rather than repeated: if the origin ever moves, a stale copy here would assert the old one.
const ORIGIN = SITE_URL;
const PAGES = ['/', '/de/', '/en/', '/es/'];
const LOCALES = ['de', 'en', 'es', 'fr', 'nl', 'pt'] as const;

const fetchHtml = async (request: import('@playwright/test').APIRequestContext, path: string) => {
	const response = await request.get(`${BASE}${path}`);
	expect(response.status(), path).toBe(200);
	return response.text();
};

const attr = (html: string, pattern: RegExp) => [...html.matchAll(pattern)].map((m) => m[1]);

test.describe('prerendered SEO metadata', () => {
	test('serves a real document for the root and every language', async ({ request }) => {
		for (const path of PAGES) expect((await fetchHtml(request, path)).length).toBeGreaterThan(500);
	});

	test('gives every page exactly one title', async ({ request }) => {
		// Two <title> elements is invalid HTML and the browser silently honours the first.
		for (const path of PAGES) {
			const html = await fetchHtml(request, path);
			expect(attr(html, /<title>([^<]*)<\/title>/g), path).toHaveLength(1);
		}
	});

	test('titles each language differently', async ({ request }) => {
		const titles = await Promise.all(
			LOCALES.map(async (l) => attr(await fetchHtml(request, `/${l}/`), /<title>([^<]*)<\/title>/g)[0])
		);
		expect(new Set(titles).size).toBe(LOCALES.length);
		for (const title of titles) expect(title.trim().length).toBeGreaterThan(10);
	});

	test('describes each language differently', async ({ request }) => {
		const pattern = /<meta name="description" content="([^"]*)"/g;
		const descriptions = await Promise.all(
			LOCALES.map(async (l) => attr(await fetchHtml(request, `/${l}/`), pattern)[0])
		);
		expect(new Set(descriptions).size).toBe(LOCALES.length);
		for (const d of descriptions) expect(d.length).toBeGreaterThan(40);
	});

	test('sets <html lang> to match the route', async ({ request }) => {
		for (const l of LOCALES) {
			expect(attr(await fetchHtml(request, `/${l}/`), /<html lang="([a-z-]+)"/g)[0], l).toBe(l);
		}
		// the root is the default language
		expect(attr(await fetchHtml(request, '/'), /<html lang="([a-z-]+)"/g)[0]).toBe('en');
	});

	test('leaves no unreplaced template placeholder', async ({ request }) => {
		for (const path of PAGES) expect(await fetchHtml(request, path), path).not.toContain('%lang%');
	});

	test('canonicalises each language to itself, and the root to the default', async ({ request }) => {
		for (const l of LOCALES) {
			const html = await fetchHtml(request, `/${l}/`);
			expect(attr(html, /rel="canonical" href="([^"]*)"/g)[0]).toBe(`${ORIGIN}${BASE}/${l}/`);
		}
		// The root and /en/ would otherwise compete as duplicates of the same content.
		expect(attr(await fetchHtml(request, '/'), /rel="canonical" href="([^"]*)"/g)[0]).toBe(`${ORIGIN}${BASE}/en/`);
	});

	test('carries a reciprocal, absolute hreflang set on every page', async ({ request }) => {
		// The two rules that silently invalidate the whole set: every page must list every language
		// INCLUDING ITSELF, and every URL must be absolute.
		for (const path of PAGES) {
			const html = await fetchHtml(request, path);
			const links = [...html.matchAll(/rel="alternate" hreflang="([a-z-]+)" href="([^"]*)"/g)].map((m) => ({
				lang: m[1],
				href: m[2]
			}));
			expect(links.map((l) => l.lang).sort(), path).toEqual(['de', 'en', 'es', 'fr', 'nl', 'pt', 'x-default']);
			for (const link of links) expect(link.href, `${path} → ${link.lang}`).toMatch(/^https:\/\//);
			for (const l of LOCALES) {
				expect(links.find((x) => x.lang === l)!.href, `${path} → ${l}`).toBe(`${ORIGIN}${BASE}/${l}/`);
			}
		}
	});

	test('points x-default at the dispatching root', async ({ request }) => {
		// x-default means "for readers whose language you do not handle" — that is the root, not /en/.
		for (const path of PAGES) {
			const html = await fetchHtml(request, path);
			const xDefault = attr(html, /hreflang="x-default" href="([^"]*)"/g)[0];
			expect(xDefault, path).toBe(`${ORIGIN}${BASE}/`);
		}
	});

	test('gives the root the default language’s metadata', async ({ request }) => {
		// This is what a shared root link previews as, and what a crawler without JS indexes.
		const root = await fetchHtml(request, '/');
		const en = await fetchHtml(request, '/en/');
		const title = (html: string) => attr(html, /<title>([^<]*)<\/title>/g)[0];
		const og = (html: string) => attr(html, /property="og:title" content="([^"]*)"/g)[0];
		expect(title(root)).toBe(title(en));
		expect(og(root)).toBe(og(en));
	});

	test('carries the Open Graph set on every page', async ({ request }) => {
		for (const path of PAGES) {
			const html = await fetchHtml(request, path);
			for (const property of ['og:title', 'og:description', 'og:url', 'og:type', 'og:site_name', 'og:locale']) {
				expect(html, `${path} → ${property}`).toContain(`property="${property}"`);
			}
			expect(attr(html, /property="og:type" content="([^"]*)"/g)[0]).toBe('website');
		}
	});

	test('declares the territory-coded og:locale and its alternates', async ({ request }) => {
		const expected = { de: 'de_DE', en: 'en_GB', es: 'es_ES', fr: 'fr_FR', nl: 'nl_NL', pt: 'pt_PT' };
		for (const l of LOCALES) {
			const html = await fetchHtml(request, `/${l}/`);
			expect(attr(html, /property="og:locale" content="([^"]*)"/g)[0], l).toBe(expected[l]);
			const alternates = attr(html, /property="og:locale:alternate" content="([^"]*)"/g);
			expect(alternates.sort(), l).toEqual(
				Object.entries(expected)
					.filter(([code]) => code !== l)
					.map(([, value]) => value)
					.sort()
			);
		}
	});

	test('declares the large social card, with an absolute image URL and dimensions', async ({ request }) => {
		// summary_large_image is only safe now that a real 1200×630 og.jpg ships (npm run og:image).
		for (const path of PAGES) {
			const html = await fetchHtml(request, path);
			expect(attr(html, /name="twitter:card" content="([^"]*)"/g)[0], path).toBe('summary_large_image');
			expect(attr(html, /property="og:image" content="([^"]*)"/g)[0], path).toBe(`${ORIGIN}${BASE}/og.jpg`);
			expect(attr(html, /property="og:image:width" content="([^"]*)"/g)[0], path).toBe('1200');
			expect(attr(html, /property="og:image:height" content="([^"]*)"/g)[0], path).toBe('630');
			expect(attr(html, /property="og:image:alt" content="([^"]*)"/g)[0], path).toMatch(/\S/);
		}
	});

	test('serves the social image at the advertised size', async ({ page, request }) => {
		// The meta tags promise 1200×630; a stale or missing static/og.jpg would break every share
		// preview while all other tests stay green. Decode the actual bytes and measure.
		const res = await request.get(`${BASE}/og.jpg`);
		expect(res.status()).toBe(200);
		expect(res.headers()['content-type']).toContain('image/jpeg');
		await page.goto(`${BASE}/en/`);
		const size = await page.evaluate(
			(src) =>
				new Promise<{ w: number; h: number }>((resolve, reject) => {
					const img = new Image();
					img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
					img.onerror = reject;
					img.src = src;
				}),
			`${BASE}/og.jpg`
		);
		expect(size).toEqual({ w: 1200, h: 630 });
	});

	test('links between languages in the canonical form', async ({ request }) => {
		// An internal link to /de instead of /de/ points at a URL the canonical does not claim, which
		// costs a redirect on every cold hit and muddies which URL gets indexed.
		for (const path of PAGES) {
			const html = await fetchHtml(request, path);
			// `href` is not always the first attribute — aria-current precedes it on the active link.
			const internal = attr(html, /<a [^>]*href="(\/eclipse-2026\/[a-z]{2}[^"]*)"/g);
			expect(internal.length, path).toBeGreaterThanOrEqual(3);
			for (const href of internal) expect(href, `${path} → ${href}`).toMatch(/\/[a-z]{2}\/$/);
		}
	});

	test('answers an unknown language with a 404, not an empty shell', async ({ request }) => {
		// There is no SPA fallback any more, precisely so this cannot come back as a soft 404.
		const response = await request.get(`${BASE}/it/`);
		expect(response.status()).toBe(404);
	});
});
