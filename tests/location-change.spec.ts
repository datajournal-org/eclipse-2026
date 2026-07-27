import { test, expect, localeUrl, mapReady, byName, PHOTON } from './fixtures';

/**
 * Changing an *existing* location, as opposed to setting one for the first time.
 *
 * Every other spec loads a page per location, which cannot catch a component that reads the location
 * once at mount — and one did: SkyView built its map, timeline and camera from the coordinates it saw in
 * `onMount`, and `{#if $userLocation}` stays truthy across a change, so Svelte kept the same instance.
 * B1 said Berlin while B3 went on rendering Oviedo's sky, with contact times 19 minutes apart.
 *
 * The rule these tests encode: after a change, NOTHING may still be showing the old place.
 */
const OVIEDO = byName('Oviedo'); // total, 100 %, maximum 20:27 local
const BERLIN = byName('Berlin'); // partial, ~85 %, maximum 20:08 local

/** Everything on the page that depends on where you are. */
async function snapshot(page: import('@playwright/test').Page) {
	return {
		place: (await page.locator('.place .pname').innerText()).trim(),
		verdict: await page.locator('section.b1 h2').innerText(),
		coverage: await page.locator('section.b1 .obsc').innerText(),
		safety: await page.locator('section.b1 .safety').innerText(),
		skyReadout: (await page.locator('section.b3 .readout').innerText()).replace(/\s+/g, ' '),
		skyPhases: (await page.locator('section.b3 .labels .lab').allInnerTexts()).join('|').replace(/\s+/g, ' '),
		checklistCountdown: (await page.locator('section.b6 .count').innerText()).replace(/\s+/g, ' ')
	};
}

async function changeTo(page: import('@playwright/test').Page, query: string) {
	await page.getByRole('button', { name: 'ändern' }).click();
	await page.getByRole('searchbox', { name: 'Stadt oder Adresse suchen' }).fill(query);
	await page.locator('.results li button').first().click();
	await page.getByRole('button', { name: /Diesen Ort verwenden/ }).click();
	await expect(page.locator('dialog.picker-dlg')).toBeHidden();
	await mapReady(page, 'section.b3'); // B3 is rebuilt for the new place
}

test.describe('changing the location @webgl', () => {
	test('updates every location-dependent section, not just the verdict', async ({
		page,
		locatedPage,
		stubGeocoder
	}) => {
		await locatedPage(OVIEDO);
		await mapReady(page, 'section.b3');
		const before = await snapshot(page);

		await stubGeocoder(PHOTON.bare); // Berlin
		await changeTo(page, 'Berlin');
		const after = await snapshot(page);

		// Every field must have moved. Naming them individually is the point: the bug this replaces was
		// invisible to anyone checking only the card they happened to be looking at.
		for (const key of Object.keys(before) as (keyof typeof before)[]) {
			expect(after[key], `${key} did not update`).not.toBe(before[key]);
		}
	});

	test('leaves nothing showing the previous place', async ({ page, locatedPage, stubGeocoder }) => {
		await locatedPage(OVIEDO);
		await mapReady(page, 'section.b3');

		await stubGeocoder(PHOTON.bare);
		await changeTo(page, 'Berlin');
		const after = await snapshot(page);

		// Berlin's numbers, and none of Oviedo's.
		expect(after.place).toContain('Berlin');
		expect(after.verdict).toBe('Partielle Sonnenfinsternis');
		expect(after.skyReadout).toContain('20:08'); // Berlin's maximum, not Oviedo's 20:27
		expect(after.skyPhases).toContain('20:08');
		expect(after.skyReadout).not.toContain('20:27');
		expect(after.skyPhases).not.toContain('20:27');
	});

	test('agrees between the verdict and the sky view', async ({ page, locatedPage, stubGeocoder }) => {
		// The failure mode was two sections contradicting each other on the same screen, which is worse
		// than either being wrong alone — so assert they match rather than just that each changed.
		await locatedPage(OVIEDO);
		await mapReady(page, 'section.b3');
		await stubGeocoder(PHOTON.bare);
		await changeTo(page, 'Berlin');

		const maxTime = (await page.locator('section.b1 .note').innerText()).match(/(\d{1,2}:\d{2})/)![1];
		await expect(page.locator('section.b3 .labels .lab').filter({ hasText: 'Maximum' })).toContainText(maxTime);
	});

	test('drops back to the un-located state when the location is cleared', async ({ page, locatedPage }) => {
		await locatedPage(OVIEDO);
		await expect(page.locator('section.b3')).toBeVisible();

		// Navigate away from the ?lat&lon debug override as well as clearing storage — otherwise the URL
		// re-seeds the location on reload and this would test nothing.
		await page.evaluate(() => window.localStorage.removeItem('eclipse.location'));
		await page.goto(localeUrl());

		for (const section of ['section.b1', 'section.b3', 'section.b6']) {
			await expect(page.locator(section)).toHaveCount(0);
		}
		await expect(page.getByRole('button', { name: /Standort wählen/ })).toBeVisible();
	});

	test('survives changing location twice in a row', async ({ page, locatedPage, stubGeocoder }) => {
		// Re-keying destroys and rebuilds a WebGL scene each time; doing it twice catches a teardown that
		// leaves the second scene wedged.
		await locatedPage(BERLIN);
		await mapReady(page, 'section.b3');

		await stubGeocoder(PHOTON.oviedo);
		await changeTo(page, 'Oviedo');
		await expect(page.locator('section.b1 h2')).toHaveText('Totale Sonnenfinsternis');

		await stubGeocoder(PHOTON.bare);
		await changeTo(page, 'Berlin');
		await expect(page.locator('section.b1 h2')).toHaveText('Partielle Sonnenfinsternis');
		await expect(page.locator('section.b3 .readout')).toContainText('20:08');
	});
});
