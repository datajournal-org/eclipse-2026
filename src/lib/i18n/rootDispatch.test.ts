import { describe, it, expect } from 'vitest';
import appHtml from '../../app.html?raw';
import { LOCALES, DEFAULT_LOCALE } from './index';

/**
 * The bare root's language dispatch is an inline script in app.html — it has to run before the bundle
 * loads, so it cannot import from here and duplicates the language list. These tests are what keep the
 * two copies in step; the decision logic itself is tested through `detectLocale` in index.dom.test.ts.
 */
const script = appHtml.slice(appHtml.indexOf('<script>'), appHtml.indexOf('</script>'));

describe('root dispatch script', () => {
	it('is present in app.html', () => {
		expect(script).toContain('location.replace');
	});

	it('lists exactly the languages the app supports', () => {
		const listed = script.match(/var LOCALES = \[([^\]]*)\]/)?.[1];
		expect(listed, 'no LOCALES array found in the inline script').toBeDefined();
		const parsed = listed!.split(',').map((entry: string) => entry.trim().replace(/^'|'$/g, ''));
		expect(parsed.sort()).toEqual([...LOCALES].sort());
	});

	it('falls back to the same default as the app', () => {
		expect(script).toContain(`|| '${DEFAULT_LOCALE}'`);
	});

	it('uses the configured base path', () => {
		expect(script).toContain(`var base = '/eclipse-2026'`);
	});

	it('guards against redirect loops on the language pages', () => {
		// Without the pathname check, /de/ would bounce through the root forever.
		expect(script).toContain('location.pathname !==');
		expect(script).toMatch(/return;/);
	});

	it('replaces rather than pushes, so Back is not a trap', () => {
		expect(script).toContain('location.replace');
		expect(script).not.toContain('location.assign');
		expect(script).not.toMatch(/location\.href\s*=/);
	});

	it('carries the query string and hash through', () => {
		expect(script).toContain('location.search');
		expect(script).toContain('location.hash');
	});

	it('tolerates a localStorage that throws', () => {
		expect(script).toMatch(/try\s*\{[\s\S]*localStorage[\s\S]*\}\s*catch/);
	});
});

describe('app.html', () => {
	it('leaves the language attribute for the server hook to fill in', () => {
		expect(appHtml).toContain('<html lang="%lang%"');
	});

	it('carries no <title> or description of its own', () => {
		// Both are owned by <svelte:head> now, per locale. A second <title> here would silently win,
		// because the browser honours the first one in the document.
		expect(appHtml).not.toContain('<title');
		expect(appHtml).not.toContain('name="description"');
	});
});

describe('base-path discipline', () => {
	// The site is served under /eclipse-2026/, so a root-absolute asset URL resolves against the origin
	// root and 404s. The corona overlay shipped exactly that bug; `asset()` from $app/paths is the fix.
	// Cheap structural check — the E2E console-error assertion is what catches it in the running app.
	const sources = Object.entries(
		import.meta.glob('../components/*.svelte', { query: '?raw', import: 'default', eager: true })
	) as [string, string][];

	it('finds no root-absolute src/href to a static file in any component', () => {
		const offenders = sources.flatMap(([file, code]) =>
			[...code.matchAll(/(?:src|href)=["']\/(?!\/)[^"']*\.(?:webp|png|jpe?g|svg|json|ico|woff2?)["']/g)].map(
				(m) => `${file}: ${m[0]}`
			)
		);
		expect(offenders).toEqual([]);
	});
});
