import { test, expect, mapReady, localeUrl } from './fixtures';
import de from '../src/lib/i18n/messages/de';

test.describe('app shell', () => {
	test('renders the brand, the un-located sections and the safety footer', async ({ page, locatedPage }) => {
		await page.goto(localeUrl());
		await expect(page.locator('header.hdr .name')).toHaveText('Eclipse 2026');
		await expect(page.locator('section.cd')).toBeVisible(); // countdown
		await expect(page.locator('section.a2')).toBeVisible(); // shadow run
		await expect(page.locator('footer.safety')).toBeVisible();
		expect(locatedPage).toBeTruthy();
	});

	test('keeps the sections in the order the wireframes define', async ({ page, locatedPage }) => {
		await locatedPage({ lat: 43.3603, lon: -5.8448, name: 'Oviedo' });
		// The B sections only exist once the client has read the location, so wait for hydration rather
		// than racing it — WebKit is slow enough to lose that race reliably.
		await expect(page.locator('section.b6')).toBeVisible();
		const order = await page.evaluate(() =>
			[...document.querySelectorAll('section, footer.safety')]
				.map((el) => [...el.classList].find((c) => /^(cd|a2|b1|b3|b6|safety)$/.test(c)))
				.filter(Boolean)
		);
		// countdown → shadow run → verdict → sky view → checklist → safety
		expect(order).toEqual(['cd', 'a2', 'b1', 'b3', 'b6', 'safety']);
	});

	test('loads without console errors or failed requests @webgl', async ({ page, pageProblems, locatedPage }) => {
		// This one assertion is what would have caught the maplibre-worker 404 that leaves every vector
		// map stuck loading — see the comment in vite.config.ts.
		await locatedPage({ lat: 43.3603, lon: -5.8448, name: 'Oviedo' });
		await mapReady(page, 'section.a2');
		await mapReady(page, 'section.b3');
		expect(pageProblems.errors).toEqual([]);
		expect(pageProblems.failedRequests).toEqual([]);
	});

	test('serves a prerendered document, not a client-rendered blank', async ({ page }) => {
		// adapter-static: the un-located shell must be in the HTML itself.
		const html = await (await page.request.get(localeUrl())).text();
		expect(html).toContain('Eclipse 2026');
		expect(html).toMatch(/<section[^>]*class="[^"]*\bcd\b/);
	});

	test('titles and describes the page in its own language', async ({ page }) => {
		await page.goto(localeUrl());
		await expect(page).toHaveTitle(de.app.page_title);
		await expect(page.locator('html')).toHaveAttribute('lang', 'de');
		await expect(page.locator('meta[name="description"]')).toHaveAttribute('content', de.app.page_description);
	});
});
