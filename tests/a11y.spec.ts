import type { Page } from '@playwright/test';
import { test, expect, byName, localeUrl, openSharedLocatedPage, openSharedPage } from './fixtures';

// Every test in these two groups only READS the rendered page (names, outline, roles, geometry), so
// each group shares one page (serial) instead of paying the page load per test — the b3 pattern. The
// reduced-motion test stays outside both: `emulateMedia` must happen before ITS OWN load.

test.describe('accessibility — on the located page', () => {
	test.describe.configure({ mode: 'serial' });
	let page: Page;

	test.beforeAll(async ({ browser }) => {
		page = await openSharedLocatedPage(browser, byName('Oviedo'));
		await page.waitForTimeout(1500); // let the map controls mount before anything inspects them
	});
	test.afterAll(async () => page.context().close());

	test('gives every interactive element an accessible name', async () => {
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

	test('starts with one first-level heading and a sensible outline', async () => {
		const levels = await page.evaluate(() =>
			[...document.querySelectorAll('h1, h2, h3')].map((el) => Number(el.tagName[1]))
		);
		expect(levels.length).toBeGreaterThan(3);
		// no level is skipped on the way down
		for (let i = 1; i < levels.length; i++) expect(levels[i] - levels[i - 1]).toBeLessThanOrEqual(1);
	});

	test('marks the section dividers as separators', async () => {
		const separators = page.locator('[role="separator"]');
		expect(await separators.count()).toBeGreaterThan(0);
		await expect(separators.first()).toHaveAttribute('aria-label', /\S/);
	});

	test('hides decorative glyphs from screen readers', async () => {
		// The emoji and icon spans carry no meaning; unhidden, they get read out as noise.
		for (const selector of ['header.hdr .mark', 'section.a2 .track']) {
			await expect(page.locator(selector).first()).toHaveAttribute('aria-hidden', 'true');
		}
	});

	test('meets WCAG 2.5.8 target size for the scrubber and its phase labels', async () => {
		// 2.5.8 wants 24x24 CSS px, but an undersized target still conforms under the SPACING exception:
		// a 24px circle centred on it must not reach another target. The phase labels are deliberately
		// small and rely on that, so the test encodes the rule rather than a bare threshold — otherwise
		// it would either fail on a conformant layout or pass on a cramped one.
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

	test('gives both sliders a descriptive label', async () => {
		for (const section of ['section.a2', 'section.b3']) {
			await expect(page.locator(`${section} input[type="range"]`)).toHaveAttribute('aria-label', /\S/);
		}
	});
});

test.describe('accessibility — on the un-located page', () => {
	test.describe.configure({ mode: 'serial' });
	let page: Page;

	test.beforeAll(async ({ browser }) => {
		page = await openSharedPage(browser, localeUrl());
	});
	test.afterAll(async () => page.context().close());

	// FIRST in the group, deliberately: the walk below starts from the top of the tab order, and that
	// only holds on the fresh page — Chromium keeps the sequential-focus starting point at the last
	// focused element, and blur() does not reset it, so any earlier test that focuses something would
	// silently shift where Tab lands.
	test('reaches the language switcher by keyboard', async () => {
		// WebKit is excluded because of a Safari preference, not anything in this page. macOS Safari ships
		// with "Press Tab to highlight each item on a webpage" off, and under that restricted tab order Tab
		// visits form controls only — both <button> and <a> are skipped. Verified by injecting a bare
		// input, button and link into the page: only the input takes focus. So there is no meaningful tab
		// order to assert on WebKit until a text field is on screen.
		test.skip(
			test.info().project.name === 'webkit',
			'Safari’s restricted tab order visits form controls only — a browser preference, not a page defect'
		);

		const active = () =>
			page.evaluate(() => {
				const el = document.activeElement as HTMLElement | null;
				if (!el) return 'none';
				const label = el.getAttribute('aria-label') ?? el.textContent?.trim() ?? '';
				return `${el.tagName}:${label.slice(0, 16)}`;
			});
		// The brand-mark link (to datajournal.org) is the first stop — it must be keyboard-reachable,
		// and a home link leading the tab order is the convention — then the language disclosure…
		await page.keyboard.press('Tab');
		expect(await active()).toBe('A:datajournal.org');
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
		// Close the menu again — the group's later tests must not meet a dangling open menu.
		await page.keyboard.press('Escape');
	});

	test('shows a visible focus indicator', async () => {
		const button = page.getByRole('button', { name: /Standort wählen/ });
		await button.focus();
		const style = await button.evaluate((el) => {
			const s = getComputedStyle(el);
			return { outlineWidth: s.outlineWidth, outlineStyle: s.outlineStyle, boxShadow: s.boxShadow };
		});
		const hasRing = style.outlineStyle !== 'none' || style.boxShadow !== 'none';
		expect(hasRing).toBe(true);
	});

	test('labels the language group', async () => {
		await expect(page.getByRole('group', { name: /Sprache/ })).toBeVisible();
	});

	test('keeps text legible against its background', async () => {
		// A coarse guard: body text must not be rendered in the background colour.
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

test.describe('accessibility — special contexts', () => {
	test('honours prefers-reduced-motion', async ({ page, locatedPage }) => {
		await page.emulateMedia({ reducedMotion: 'reduce' });
		await locatedPage(byName('Oviedo'));
		// The page must still be fully usable with animation suppressed.
		await expect(page.locator('section.b1')).toBeVisible();
		await expect(page.locator('section.cd .units')).toBeVisible();
	});
});
