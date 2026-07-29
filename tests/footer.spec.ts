import { test, expect, localeUrl, ALL_LANGS, switchLanguage } from './fixtures';
import { REPO_URL, IMPRINT_URL, translationFileUrl } from '../src/lib/config';

const LABELS = {
	de: { source: 'Quelltext auf GitHub', translation: 'Diese Übersetzung verbessern', imprint: 'Impressum' },
	en: { source: 'Source code on GitHub', translation: 'Improve this translation', imprint: 'Imprint' },
	es: { source: 'Código fuente en GitHub', translation: 'Mejorar esta traducción', imprint: 'Aviso legal' },
	fr: { source: 'Code source sur GitHub', translation: 'Améliorer cette traduction', imprint: 'Mentions légales' },
	nl: { source: 'Broncode op GitHub', translation: 'Deze vertaling verbeteren', imprint: 'Colofon' },
	pt: { source: 'Código-fonte no GitHub', translation: 'Melhorar esta tradução', imprint: 'Aviso legal' }
} as const;

test.describe('colophon footer', () => {
	// One navigation per language, all three links checked on it — the repository link, the translation
	// link (which must name the file holding the words on THIS page, so a reader who spots a clumsy
	// sentence is not dropped at a repository root to go hunting), and the imprint (a legal requirement
	// for a site published in Germany — a locale whose footer lost it would be a compliance bug).
	for (const lang of ALL_LANGS) {
		test(`carries all three links, localized, when reading ${lang}`, async ({ page }) => {
			await page.goto(localeUrl(lang));

			const source = page.getByRole('link', { name: LABELS[lang].source });
			await expect(source).toBeVisible();
			await expect(source).toHaveAttribute('href', REPO_URL);

			const translation = page.getByRole('link', { name: LABELS[lang].translation });
			await expect(translation).toBeVisible();
			await expect(translation).toHaveAttribute('href', translationFileUrl(lang));
			expect(translationFileUrl(lang)).toContain(`/messages/${lang}.ts`);

			const imprint = page.getByRole('link', { name: LABELS[lang].imprint, exact: true });
			await expect(imprint).toBeVisible();
			await expect(imprint).toHaveAttribute('href', IMPRINT_URL);
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
