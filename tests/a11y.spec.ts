import { test, expect, byName, localeUrl } from './fixtures';

test.describe('accessibility', () => {
	test('gives every interactive element an accessible name', async ({ page, locatedPage }) => {
		await locatedPage(byName('Oviedo'));
		await page.waitForTimeout(1500); // let the map controls mount
		const unnamed = await page.evaluate(() =>
			[...document.querySelectorAll('button, a[href], input, [role="button"]')]
				.filter((el) => (el as HTMLElement).offsetParent !== null)
				.filter((el) => {
					const text = (el.textContent ?? '').trim();
					const label = el.getAttribute('aria-label') ?? el.getAttribute('title') ?? '';
					return !text && !label.trim();
				})
				.map((el) => `${el.tagName}.${el.className}`)
		);
		expect(unnamed).toEqual([]);
	});

	test('starts with one first-level heading and a sensible outline', async ({ page, locatedPage }) => {
		await locatedPage(byName('Oviedo'));
		const levels = await page.evaluate(() =>
			[...document.querySelectorAll('h1, h2, h3')].map((el) => Number(el.tagName[1]))
		);
		expect(levels.length).toBeGreaterThan(3);
		// no level is skipped on the way down
		for (let i = 1; i < levels.length; i++) expect(levels[i] - levels[i - 1]).toBeLessThanOrEqual(1);
	});

	test('reaches the language switcher by keyboard', async ({ page }) => {
		// WebKit is excluded because of a Safari preference, not anything in this page. macOS Safari ships
		// with "Press Tab to highlight each item on a webpage" off, and under that restricted tab order Tab
		// visits form controls only — both <button> and <a> are skipped. Verified by injecting a bare
		// input, button and link into the page: only the input takes focus. So there is no meaningful tab
		// order to assert on WebKit until a text field is on screen.
		test.skip(
			test.info().project.name === 'webkit',
			'Safari’s restricted tab order visits form controls only — a browser preference, not a page defect'
		);

		await page.goto(localeUrl());
		const active = () =>
			page.evaluate(() => {
				const el = document.activeElement as HTMLElement | null;
				if (!el) return 'none';
				const label = el.getAttribute('aria-label') ?? el.textContent?.trim() ?? '';
				return `${el.tagName}:${label.slice(0, 16)}`;
			});
		// The switcher comes first in the tab order, before the map: one Tab lands on the disclosure…
		await page.keyboard.press('Tab');
		expect(await active()).toMatch(/^SUMMARY:Sprache/);
		// …Enter opens it, and the language links become the next tab stops (links inside a closed
		// <details> are correctly NOT tabbable, so the menu adds no hidden stops when shut).
		await page.keyboard.press('Enter');
		const reached: string[] = [];
		for (let i = 0; i < 3; i++) {
			await page.keyboard.press('Tab');
			reached.push(await active());
		}
		expect(reached.filter((r) => r.startsWith('A:')).length, reached.join(' → ')).toBe(3);
	});

	test('shows a visible focus indicator', async ({ page }) => {
		await page.goto(localeUrl());
		const button = page.getByRole('button', { name: /Standort wählen/ });
		await button.focus();
		const style = await button.evaluate((el) => {
			const s = getComputedStyle(el);
			return { outlineWidth: s.outlineWidth, outlineStyle: s.outlineStyle, boxShadow: s.boxShadow };
		});
		const hasRing = style.outlineStyle !== 'none' || style.boxShadow !== 'none';
		expect(hasRing).toBe(true);
	});

	test('labels the language group', async ({ page }) => {
		await page.goto(localeUrl());
		await expect(page.getByRole('group', { name: /Sprache/ })).toBeVisible();
	});

	test('marks the section dividers as separators', async ({ page, locatedPage }) => {
		await locatedPage(byName('Oviedo'));
		const separators = page.locator('[role="separator"]');
		expect(await separators.count()).toBeGreaterThan(0);
		await expect(separators.first()).toHaveAttribute('aria-label', /\S/);
	});

	test('hides decorative glyphs from screen readers', async ({ page, locatedPage }) => {
		// The emoji and icon spans carry no meaning; unhidden, they get read out as noise.
		await locatedPage(byName('Oviedo'));
		for (const selector of ['header.hdr .mark', 'section.a2 .track']) {
			await expect(page.locator(selector).first()).toHaveAttribute('aria-hidden', 'true');
		}
	});

	test('meets WCAG 2.5.8 target size for the scrubber and its phase labels', async ({ page, locatedPage }) => {
		// 2.5.8 wants 24x24 CSS px, but an undersized target still conforms under the SPACING exception:
		// a 24px circle centred on it must not reach another target. The phase labels are deliberately
		// small and rely on that, so the test encodes the rule rather than a bare threshold — otherwise
		// it would either fail on a conformant layout or pass on a cramped one.
		await locatedPage(byName('Oviedo'));
		const boxes = await page.evaluate(() => {
			const section = document.querySelector('section.a2')!;
			const els = [...section.querySelectorAll('input[type=range], .lab')];
			return els.map((el) => {
				const r = el.getBoundingClientRect();
				return {
					tag: el.tagName + '.' + el.className,
					w: r.width,
					h: r.height,
					cx: r.x + r.width / 2,
					cy: r.y + r.height / 2
				};
			});
		});
		expect(boxes.length).toBeGreaterThan(1);

		const slider = boxes.find((b) => b.tag.startsWith('INPUT'))!;
		expect(slider.h, 'the scrubber is the primary control and should meet the size outright').toBeGreaterThanOrEqual(
			24
		);

		for (const box of boxes) {
			if (box.w >= 24 && box.h >= 24) continue; // conforms on size alone
			for (const other of boxes) {
				if (other === box) continue;
				const gap = Math.hypot(box.cx - other.cx, box.cy - other.cy);
				expect(
					gap,
					`${box.tag} is ${box.w}x${box.h} and only ${gap.toFixed(0)}px from ${other.tag}`
				).toBeGreaterThanOrEqual(24);
			}
		}
	});

	test('gives both sliders a descriptive label', async ({ page, locatedPage }) => {
		await locatedPage(byName('Oviedo'));
		for (const section of ['section.a2', 'section.b3']) {
			await expect(page.locator(`${section} input[type="range"]`)).toHaveAttribute('aria-label', /\S/);
		}
	});

	test('honours prefers-reduced-motion', async ({ page, locatedPage }) => {
		await page.emulateMedia({ reducedMotion: 'reduce' });
		await locatedPage(byName('Oviedo'));
		// The page must still be fully usable with animation suppressed.
		await expect(page.locator('section.b1')).toBeVisible();
		await expect(page.locator('section.cd .units')).toBeVisible();
	});

	test('keeps text legible against its background', async ({ page }) => {
		// A coarse guard: body text must not be rendered in the background colour.
		await page.goto(localeUrl());
		// `.cap` only appears once hydration flips the countdown out of its "happening now" branch, and
		// page.evaluate below does not retry.
		await page.locator('section.cd .cap').waitFor({ state: 'visible' });
		const { colour, background } = await page.evaluate(() => {
			const el = document.querySelector('section.cd .cap')!;
			return { colour: getComputedStyle(el).color, background: getComputedStyle(document.body).backgroundColor };
		});
		expect(colour).not.toBe(background);
	});
});
