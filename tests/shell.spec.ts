import { test, expect, mapReady } from './fixtures';

test.describe('app shell', () => {
	test('renders the brand, the un-located sections and the safety footer', async ({ page, locatedPage }) => {
		await page.goto('/');
		await expect(page.locator('header.hdr .name')).toHaveText('Eclipse 2026');
		await expect(page.locator('section.cd')).toBeVisible(); // countdown
		await expect(page.locator('section.a2')).toBeVisible(); // shadow run
		await expect(page.locator('footer.safety')).toBeVisible();
		expect(locatedPage).toBeTruthy();
	});

	test('keeps the sections in the order the wireframes define', async ({ page, locatedPage }) => {
		await locatedPage({ lat: 43.3603, lon: -5.8448, name: 'Oviedo' });
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
		const html = await (await page.request.get('/')).text();
		expect(html).toContain('Eclipse 2026');
		expect(html).toMatch(/<section[^>]*class="[^"]*\bcd\b/);
	});

	test('sets the document language and description', async ({ page }) => {
		await page.goto('/');
		await expect(page.locator('html')).toHaveAttribute('lang', 'de');
		await expect(page.locator('meta[name="description"]')).toHaveAttribute('content', /Sonnenfinsternis/);
		// NOTE: app.html has no <title>, so the tab and any shared link show the bare URL. Not asserted
		// here because the fix is a copy decision, not a test one.
	});
});
