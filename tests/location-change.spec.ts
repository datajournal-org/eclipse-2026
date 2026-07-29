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

/** Everything that depends on where you are — what the page shows, plus what the device remembers. */
async function snapshot(page: import('@playwright/test').Page) {
	return {
		// The persisted record belongs in here rather than in a test of its own: a change that repaints
		// every section but never reaches storage looks perfect until the next visit, when the app comes
		// back with the old place. Storage is simply one more thing that must stop saying "Oviedo".
		stored: (await page.evaluate(() => window.localStorage.getItem('eclipse.location'))) ?? '',
		place: (await page.locator('.place .pname').innerText()).trim(),
		// the headline carries kind AND coverage in one h2, so `verdict` covers the percentage too
		verdict: await page.locator('section.b1 h2').innerText(),
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
		expect(JSON.parse(after.stored)).toMatchObject({ lat: 52.52, lon: 13.405 });
		expect(after.place).toContain('Berlin');
		// the combined headline: Berlin's kind AND Berlin's coverage, none of Oviedo's 100 %
		expect(after.verdict).toContain('Partielle Sonnenfinsternis');
		expect(after.verdict).toContain('85');
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

		for (const section of ['section.b1', 'section.b3']) {
			await expect(page.locator(section)).toHaveCount(0);
		}
		// B6 remains, but in its state-A form: nothing local left over (no countdown, no calendar).
		await expect(page.locator('section.b6')).toBeVisible();
		await expect(page.locator('section.b6 .count')).toHaveCount(0);
		await expect(page.locator('section.b6 .cal')).toHaveCount(0);
		await expect(page.getByRole('button', { name: /Standort wählen/ })).toBeVisible();
	});

	test('survives changing location twice in a row', async ({ page, locatedPage, stubGeocoder }) => {
		// Re-keying destroys and rebuilds a WebGL scene each time; doing it twice catches a teardown that
		// leaves the second scene wedged.
		await locatedPage(BERLIN);
		await mapReady(page, 'section.b3');

		await stubGeocoder(PHOTON.oviedo);
		await changeTo(page, 'Oviedo');
		await expect(page.locator('section.b1 h2')).toContainText('Totale Sonnenfinsternis');

		await stubGeocoder(PHOTON.bare);
		await changeTo(page, 'Berlin');
		await expect(page.locator('section.b1 h2')).toContainText('Partielle Sonnenfinsternis');
		await expect(page.locator('section.b3 .readout')).toContainText('20:08');

		// The only place in the suite where storage is written twice: the second write must replace the
		// first outright, not merge into it and leave Oviedo's name attached to Berlin's coordinates.
		const stored = await page.evaluate(() => window.localStorage.getItem('eclipse.location'));
		expect(JSON.parse(stored!)).toEqual({ lat: 52.52, lon: 13.405, name: 'Berlin' });
	});

	test('the new place survives a fresh load with no URL parameters', async ({ page, locatedPage, stubGeocoder }) => {
		// The round trip, end to end: written by the app, read back by the app. Every other persistence
		// test either checks the string in storage or reads a value the *fixture* seeded — and the
		// storedPage fixture re-seeds on every navigation, so it cannot notice a write that never happened.
		await locatedPage(OVIEDO);
		await mapReady(page, 'section.b3');

		await stubGeocoder(PHOTON.bare);
		await changeTo(page, 'Berlin');

		// Leaving ?lat&lon behind matters: it seeded Oviedo and takes precedence over storage, so on this
		// load the only thing that can produce Berlin is what the app itself wrote.
		await page.goto(localeUrl());
		await expect(page.locator('section.b1 h2')).toContainText('Partielle Sonnenfinsternis');
		await expect(page.locator('.place .pname')).toContainText('Berlin');
	});
});
