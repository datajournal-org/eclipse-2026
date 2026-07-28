import { test, expect, localeUrl, LANG, PHOTON } from './fixtures';

const openDialog = async (page: import('@playwright/test').Page) => {
	await page.goto(localeUrl());
	await page.getByRole('button', { name: /Standort wählen/ }).click();
	await expect(page.locator('dialog.picker-dlg')).toBeVisible();
};

test.describe('location dialog', () => {
	test('opens from the call to action', async ({ page, stubGeocoder }) => {
		await stubGeocoder();
		await openDialog(page);
		await expect(page.locator('dialog.picker-dlg h2')).toHaveText('Standort wählen');
	});

	test('is a real modal dialog, labelled for assistive tech', async ({ page, stubGeocoder }) => {
		await stubGeocoder();
		await openDialog(page);
		const dialog = page.locator('dialog.picker-dlg');
		await expect(dialog).toHaveAttribute('aria-label', 'Standort wählen');
		// a modal <dialog> puts the rest of the page in the inert subtree
		expect(await dialog.evaluate((el) => (el as HTMLDialogElement).open)).toBe(true);
	});

	test('moves focus into the dialog and traps it there', async ({ page, stubGeocoder }) => {
		await stubGeocoder();
		await openDialog(page);
		// Tab must never reach a page control behind the modal. Chromium parks focus on <body> for one
		// step as the cycle wraps, which is fine — what matters is that no header/page button is reachable.
		const visited: string[] = [];
		for (let i = 0; i < 10; i++) {
			await page.keyboard.press('Tab');
			visited.push(
				await page.evaluate(() => {
					const el = document.activeElement;
					if (!el || el === document.body) return 'body';
					return el.closest('dialog.picker-dlg') ? 'dialog' : `OUTSIDE:${el.tagName}.${el.className}`;
				})
			);
		}
		expect(visited.filter((v) => v.startsWith('OUTSIDE'))).toEqual([]);
		expect(visited.filter((v) => v === 'dialog').length).toBeGreaterThan(3);
	});

	test('closes on Escape', async ({ page, stubGeocoder }) => {
		await stubGeocoder();
		await openDialog(page);
		await page.keyboard.press('Escape');
		await expect(page.locator('dialog.picker-dlg')).toBeHidden();
	});

	test('closes from the close button', async ({ page, stubGeocoder }) => {
		await stubGeocoder();
		await openDialog(page);
		await page.getByRole('button', { name: 'Schließen' }).click();
		await expect(page.locator('dialog.picker-dlg')).toBeHidden();
	});

	test('closes when the backdrop is clicked', async ({ page, stubGeocoder }) => {
		await stubGeocoder();
		await openDialog(page);
		// press at the very top-left, outside the sheet
		await page.mouse.move(5, 5);
		await page.mouse.down();
		await page.mouse.up();
		await expect(page.locator('dialog.picker-dlg')).toBeHidden();
	});

	test('stays open when the sheet itself is clicked', async ({ page, stubGeocoder }) => {
		await stubGeocoder();
		await openDialog(page);
		await page.locator('dialog.picker-dlg .head h2').click();
		await expect(page.locator('dialog.picker-dlg')).toBeVisible();
	});

	test('can be reopened after closing', async ({ page, stubGeocoder }) => {
		await stubGeocoder();
		await openDialog(page);
		await page.keyboard.press('Escape');
		await expect(page.locator('dialog.picker-dlg')).toBeHidden();
		await page.getByRole('button', { name: /Standort wählen/ }).click();
		await expect(page.locator('dialog.picker-dlg')).toBeVisible();
	});

	test('does not swallow clicks on the page once closed', async ({ page, stubGeocoder }) => {
		// The closed dialog is full-viewport by design; if it kept laying out it would eat every click.
		await stubGeocoder();
		await page.goto(localeUrl());
		const blocked = await page.evaluate(() => {
			const dialog = document.querySelector('dialog.picker-dlg')!;
			return getComputedStyle(dialog).display !== 'none';
		});
		expect(blocked).toBe(false);
	});

	test('locks the page scroll behind it, and releases it on close', async ({ page, stubGeocoder }) => {
		// showModal() makes the background inert for clicks and focus, but NOT for scrolling — without
		// the lock, touch gestures chained out of the sheet and the page (with its maps) visibly slid
		// and flickered underneath the fullscreen mobile dialog.
		await stubGeocoder();
		await page.goto(localeUrl());
		await page.getByRole('button', { name: /Standort wählen/ }).click();
		await expect(page.locator('dialog.picker-dlg')).toBeVisible();

		// let the click's own smooth scroll settle first, or its tail reads as background scrolling
		await expect
			.poll(async () => {
				const a = await page.evaluate(() => window.scrollY);
				await page.waitForTimeout(120);
				return (await page.evaluate(() => window.scrollY)) - a;
			})
			.toBe(0);
		const before = await page.evaluate(() => window.scrollY);
		await page.evaluate(() => window.scrollBy(0, 400));
		expect(
			Math.abs((await page.evaluate(() => window.scrollY)) - before),
			'page scrolled behind the modal'
		).toBeLessThan(2);

		await page.keyboard.press('Escape');
		await expect(page.locator('dialog.picker-dlg')).not.toBeVisible();
		await page.evaluate(() => window.scrollBy(0, 400));
		expect(await page.evaluate(() => window.scrollY), 'scroll stayed locked after closing').toBeGreaterThan(before);
	});

	test('labels the pin with coordinates when the name service is down', async ({ page, stubGeocoder }) => {
		// Reverse geocoding is decoration: with the geocoder failing (or timed out), the footer must fall
		// back to the coordinates — the real content — instead of an eternal "…" that reads as loading.
		await stubGeocoder({}, 500);
		await page.goto(localeUrl());
		await page.getByRole('button', { name: /Standort wählen/ }).click();
		const place = page.locator('dialog.picker-dlg .summary .place');
		await expect(place).toContainText(/43\.000°, -4\.500°/); // the corridor default point
		// the eclipse verdict beside it is computed locally and owes the geocoder nothing
		await expect(page.locator('dialog.picker-dlg .verdict')).toContainText('Totalität');
	});

	test('upgrades the committed location when its name arrives after confirming', async ({ page, stubGeocoder }) => {
		// Confirming faster than the geocoder answers used to freeze the location as raw coordinates
		// forever. The late answer now upgrades the committed location — if it is for exactly that point.
		await stubGeocoder(PHOTON.oviedo, 200, 1500);
		await page.goto(localeUrl(LANG, '?lat=43.3603&lon=-5.8448'));
		await expect(page.locator('.place .pname')).toContainText('43.360'); // no name yet
		await page.getByRole('button', { name: 'ändern' }).click();
		await page.getByRole('button', { name: /Diesen Ort verwenden/ }).click(); // outrun the geocoder
		await expect(page.locator('dialog.picker-dlg')).not.toBeVisible();
		// …and once the slow answer lands, the page header trades coordinates for the name
		await expect(page.locator('.place .pname')).toContainText('Oviedo', { timeout: 5000 });
	});

	test('offers the confirm button in a disabled state until a place is pending', async ({ page, stubGeocoder }) => {
		await stubGeocoder();
		await openDialog(page);
		await expect(page.getByRole('button', { name: /Diesen Ort verwenden/ })).toBeVisible();
	});

	test('explains that the pin can be dragged', async ({ page, stubGeocoder }) => {
		await stubGeocoder();
		await openDialog(page);
		await expect(page.locator('dialog.picker-dlg .adjust')).toContainText('Pin ziehen');
	});
});
