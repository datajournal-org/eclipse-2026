import { test, expect, byName, localeUrl } from './fixtures';

/**
 * The segment grammar (docs/WIREFRAMES.md § Segment grammar), enforced. A component could only check
 * that slots exist as DOM; what actually keeps the page calm is restraint — one heading, one intro LINE,
 * nothing floating between sections — and that is exactly what a wrapper cannot verify and this spec
 * can. Runs against the located page, where every segment is active and the crowding risk is real.
 */
test.describe('segment grammar', () => {
	test.beforeEach(async ({ locatedPage }) => {
		await locatedPage(byName('Oviedo'));
	});

	test('the page is sections and dividers only — nothing floats between segments', async ({ page }) => {
		const strays = await page.evaluate(() =>
			[...document.querySelectorAll('main.content > *')]
				.filter((el) => !(el.tagName === 'SECTION' || el.classList.contains('section-divider')))
				.map((el) => `${el.tagName}.${el.className}`)
		);
		expect(strays).toEqual([]);
	});

	test('every segment has exactly one heading — except the hero', async ({ page }) => {
		const counts = await page.evaluate(() =>
			[...document.querySelectorAll('main.content > section')].map((s) => ({
				id: [...s.classList].join('.'),
				h2: s.querySelectorAll('h2').length
			}))
		);
		for (const s of counts) {
			// Two sanctioned headerless segments (WIREFRAMES.md): the countdown (the page's hero — giant
			// digits need no title) and the donate card (a personal note, not a titled section).
			const headerless = s.id.includes('cd') || s.id.includes('donate');
			expect(s.h2, s.id).toBe(headerless ? 0 : 1);
		}
	});

	test('intros are single, and a single line', async ({ page }) => {
		// The one-line rule is the grammar's teeth: it is what forces the graphic to carry the weight.
		// Measured, not counted in characters, so every locale is held to it at the default viewport.
		const intros = await page.evaluate(() =>
			[...document.querySelectorAll('main.content > section')].map((s) => {
				// DIRECT child only: the intro slot sits at section level. Deeper `.sub` uses exist with
				// other meanings (the time scrubber's tick sub-labels) and are not the grammar's business.
				const subs = s.querySelectorAll(':scope > .sub');
				const first = subs[0] as HTMLElement | undefined;
				return {
					id: [...s.classList].join('.'),
					count: subs.length,
					lines: first
						? Math.round(first.getBoundingClientRect().height / parseFloat(getComputedStyle(first).lineHeight))
						: 0
				};
			})
		);
		for (const s of intros) {
			expect(s.count, `${s.id} has more than one intro`).toBeLessThanOrEqual(1);
			expect(s.lines, `${s.id}'s intro wraps — the grammar says one line`).toBeLessThanOrEqual(1);
		}
	});

	test('segment footers are single captions', async ({ page }) => {
		const foots = await page.evaluate(() =>
			[...document.querySelectorAll('main.content > section')].map((s) => ({
				id: [...s.classList].join('.'),
				count: s.querySelectorAll(':scope > .seg-foot').length
			}))
		);
		for (const s of foots) expect(s.count, s.id).toBeLessThanOrEqual(1);
	});

	test('card borders belong to actions only', async ({ page }) => {
		// Fewer boxes is the single biggest visual calm-down: content sections separate by whitespace,
		// and a bordered surface signals "you can act here" (the donate box; the CTA in the unlocated
		// state). A border creeping onto a content section reads as clutter long before anyone names it.
		const bordered = await page.evaluate(() =>
			[...document.querySelectorAll('main.content > section')]
				.filter((s) => {
					const direct = [s, ...s.querySelectorAll(':scope > div')];
					return direct.some((el) => {
						const cs = getComputedStyle(el);
						return cs.borderTopWidth !== '0px' && cs.borderTopStyle !== 'none';
					});
				})
				.map((s) => [...s.classList].join('.'))
		);
		expect(bordered).toEqual(['block.donate']);
	});

	test('holds in the unlocated state too', async ({ page, stubGeocoder }) => {
		await stubGeocoder();
		await page.goto(localeUrl());
		const strays = await page.evaluate(() =>
			[...document.querySelectorAll('main.content > *')]
				.filter((el) => !(el.tagName === 'SECTION' || el.classList.contains('section-divider')))
				.map((el) => `${el.tagName}.${el.className}`)
		);
		expect(strays).toEqual([]);
	});
});
