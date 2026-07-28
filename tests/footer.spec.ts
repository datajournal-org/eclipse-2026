import { test, expect, localeUrl, ALL_LANGS, switchLanguage } from './fixtures';
import { REPO_URL, translationFileUrl } from '../src/lib/config';

const LABELS = {
	de: { source: 'Quelltext auf GitHub', translation: 'Diese Übersetzung verbessern' },
	en: { source: 'Source code on GitHub', translation: 'Improve this translation' },
	es: { source: 'Código fuente en GitHub', translation: 'Mejorar esta traducción' },
	fr: { source: 'Code source sur GitHub', translation: 'Améliorer cette traduction' },
	nl: { source: 'Broncode op GitHub', translation: 'Deze vertaling verbeteren' },
	pt: { source: 'Código-fonte no GitHub', translation: 'Melhorar esta tradução' }
} as const;

test.describe('colophon footer', () => {
	test('links to the repository', async ({ page }) => {
		await page.goto(localeUrl());
		const link = page.getByRole('link', { name: LABELS.de.source });
		await expect(link).toBeVisible();
		await expect(link).toHaveAttribute('href', REPO_URL);
	});

	// The point of the second link: it must name the file holding the words on THIS page, so a reader who
	// spots a clumsy sentence is not dropped at a repository root to go hunting for it.
	for (const lang of ALL_LANGS) {
		test(`points at the ${lang} catalogue when reading ${lang}`, async ({ page }) => {
			await page.goto(localeUrl(lang));
			const link = page.getByRole('link', { name: LABELS[lang].translation });
			await expect(link).toBeVisible();
			await expect(link).toHaveAttribute('href', translationFileUrl(lang));
			expect(translationFileUrl(lang)).toContain(`/messages/${lang}.ts`);
		});
	}

	test('follows a language switch without a reload', async ({ page }) => {
		// The href is derived from the locale store, not baked at prerender: switching language in the
		// header is a client-side navigation, and a stale link would send a Spanish reader to German copy.
		await page.goto(localeUrl('de'));
		await switchLanguage(page, 'es');
		await expect(page.getByRole('link', { name: LABELS.es.translation })).toHaveAttribute(
			'href',
			translationFileUrl('es')
		);
	});

	test('is the page’s one contentinfo landmark, at the very end', async ({ page }) => {
		await page.goto(localeUrl());
		// Exactly one page-level footer: the colophon (promoted to <footer> when the eye-safety bar was
		// removed). The location dialog has a <footer> too, but it is scoped to the <dialog> and so maps
		// to `generic`, not `contentinfo`.
		const pageLevelFooters = await page
			.locator('footer')
			.evaluateAll((els) => els.filter((el) => !el.closest('dialog')).map((el) => el.className));
		expect(pageLevelFooters).toHaveLength(1);
		expect(pageLevelFooters[0]).toContain('colophon');
		// and nothing renders below it
		const bottom = await page.locator('footer.colophon').evaluate((el) => el.getBoundingClientRect().bottom);
		const docBottom = await page.evaluate(() => document.body.getBoundingClientRect().bottom);
		expect(bottom).toBeGreaterThanOrEqual(docBottom - 1);
	});
});
