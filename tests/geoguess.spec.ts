import { test, expect, localeUrl, BASE, GUESSED_CITY, SHOWCASE_CITY, openLocationDialog } from './fixtures';

/**
 * The landing state. This file replaces `state-a.spec.ts`: there is no "no location chosen" state in a
 * hydrated browser any more. A plain load guesses a place from the browser's time zone and opens on a
 * real sky, because what readers were missing was that the app simulates the eclipse for THEIR location
 * at all — the old first screen was a countdown, a globe, and a prompt two screens down.
 *
 * Two promises hold that together, and both are tested below: the guess is labelled as a guess, and it
 * is never written to the device.
 */
test.describe('landing on a guessed place', () => {
	test('shows the countdown, the shadow run and a simulation for the reader’s zone', async ({ page }) => {
		await page.goto(localeUrl());
		await expect(page.locator('section.cd')).toBeVisible();
		await expect(page.locator('section.a2')).toBeVisible();
		// playwright.config.ts runs everything in Europe/Berlin
		await expect(page.locator('section.b0 .place')).toContainText(GUESSED_CITY);
	});

	test('opens the personalised sections straight away', async ({ page }) => {
		await page.goto(localeUrl());
		for (const section of ['section.b1', 'section.b3', 'section.b6']) {
			await expect(page.locator(section)).toBeVisible();
		}
	});

	test('says the place was guessed rather than chosen', async ({ page }) => {
		// Naming a city the reader never picked, with no explanation, reads as a bad geolocation rather
		// than as an invitation to correct it.
		await page.goto(localeUrl());
		await expect(page.locator('section.b0 .provenance')).toContainText(/Zeitzone/);
	});

	test('writes nothing to the device', async ({ page }) => {
		// The privacy contract: storage means "the reader told us this". A guess never qualifies, and a
		// reload must not quietly promote it either.
		await page.goto(localeUrl());
		await expect(page.locator('section.b0 .place')).toBeVisible();
		expect(await page.evaluate(() => localStorage.getItem('eclipse.location'))).toBeNull();
		await page.reload();
		await expect(page.locator('section.b0 .place')).toBeVisible();
		expect(await page.evaluate(() => localStorage.getItem('eclipse.location'))).toBeNull();
	});

	test('falls back to a labelled example where the eclipse cannot be seen', async ({ browser }) => {
		// Sydney sees nothing of this eclipse. Guessing it honestly would open the app on "not visible
		// from here" — true, and the worst possible first screen — so the fallback shows a working sky
		// and says plainly whose it is.
		const context = await browser.newContext({ timezoneId: 'Australia/Sydney' });
		const page = await context.newPage();
		await page.goto(localeUrl());
		await expect(page.locator('section.b0 .place')).toContainText(SHOWCASE_CITY);
		await expect(page.locator('section.b0 .provenance')).toContainText(/Beispielort/);
		await expect(page.locator('section.b1 h2')).toContainText('Totale Sonnenfinsternis');
		await context.close();
	});

	test('promotes a place to the reader’s own once they choose it', async ({ page, stubGeocoder }) => {
		await stubGeocoder();
		await page.goto(localeUrl());
		await expect(page.locator('section.b0 .provenance')).toBeVisible();

		await openLocationDialog(page);
		await page.getByRole('button', { name: /Diesen Ort verwenden/ }).click();
		await expect(page.locator('dialog.picker-dlg')).toBeHidden();

		// Chosen ⇒ persisted, and the provenance line goes away because it has nothing left to say.
		expect(await page.evaluate(() => localStorage.getItem('eclipse.location'))).not.toBeNull();
		await expect(page.locator('section.b0 .provenance')).toHaveCount(0);
	});

	test('still ships the un-located call to action in the prerendered HTML', async ({ request }) => {
		// The guess needs JavaScript. The static document a crawler or a no-JS reader gets must therefore
		// still carry the real CTA — asserted against the raw bytes, because a DOM check would pass on
		// markup that only appears after hydration.
		const html = await (await request.get(`${BASE}/de/`)).text();
		expect(html).toContain('Standort wählen');
		expect(html).not.toContain('block b0');
	});

	test('names the reader’s time zone', async ({ page }) => {
		// The whole page is in local time, so it has to say which local.
		await page.goto(localeUrl());
		const note = page.locator('.tz-note');
		await expect(note).toBeVisible();
		await expect(note).toContainText(/MESZ|GMT\+2/);
	});

	test('counts down once per second', async ({ page }) => {
		await page.goto(localeUrl());
		const seconds = page.locator('section.cd .units .u').last().locator('.n');
		const first = await seconds.innerText();
		await expect(seconds).not.toHaveText(first, { timeout: 3000 });
	});
});
