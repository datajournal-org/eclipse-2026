import { test, expect, localeUrl } from './fixtures';
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
	for (const lang of ['de', 'en', 'es', 'fr', 'nl', 'pt'] as const) {
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
		await page.getByRole('link', { name: 'ES', exact: true }).click(); // the switcher shows codes, not names
		await expect(page.getByRole('link', { name: LABELS.es.translation })).toHaveAttribute(
			'href',
			translationFileUrl('es')
		);
	});

	test('sits below the safety notice and adds no second contentinfo landmark', async ({ page }) => {
		await page.goto(localeUrl());
		// One page-level footer: a second would give assistive tech two "contentinfo" landmarks. The
		// location dialog has a <footer> too, but it is scoped to the <dialog> and so maps to `generic`.
		const pageLevelFooters = await page
			.locator('footer')
			.evaluateAll((els) => els.filter((el) => !el.closest('dialog')).length);
		expect(pageLevelFooters).toBe(1);
		const [safetyY, colophonY] = await Promise.all([
			page.locator('footer.safety').evaluate((el) => el.getBoundingClientRect().top),
			page.locator('.colophon').evaluate((el) => el.getBoundingClientRect().top)
		]);
		expect(colophonY).toBeGreaterThan(safetyY);
	});
});
