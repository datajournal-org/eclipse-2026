import type { Page } from '@playwright/test';
import { test, expect, byName, localeUrl, openSharedLocatedPage } from './fixtures';

/**
 * The segment grammar (docs/WIREFRAMES.md § Segment grammar), enforced. A component could only check
 * that slots exist as DOM; what actually keeps the page calm is restraint — one heading, one intro LINE,
 * nothing floating between sections — and that is exactly what a wrapper cannot verify and this spec
 * can. Runs against the located page, where every segment is active and the crowding risk is real.
 */
test.describe('segment grammar', () => {
	// Every check below reads the same fully-active located page and mutates nothing, so they share one
	// page (serial) instead of paying the located-page load five times — the b3-skyview pattern.
	test.describe.configure({ mode: 'serial' });
	let page: Page;

	test.beforeAll(async ({ browser }) => {
		page = await openSharedLocatedPage(browser, byName('Oviedo'));
	});
	test.afterAll(async () => page.context().close());

	test('the page is sections and dividers only — nothing floats between segments', async () => {
		const strays = await page.evaluate(() =>
			[...document.querySelectorAll('main.content > *')]
				.filter((el) => !(el.tagName === 'SECTION' || el.classList.contains('section-divider')))
				.map((el) => `${el.tagName}.${el.className}`)
		);
		expect(strays).toEqual([]);
	});

	test('every segment has exactly one heading — except the hero', async () => {
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

	test('intros are single, and a single line', async () => {
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

	test('segment footers are single captions', async () => {
		const foots = await page.evaluate(() =>
			[...document.querySelectorAll('main.content > section')].map((s) => ({
				id: [...s.classList].join('.'),
				count: s.querySelectorAll(':scope > .seg-foot').length
			}))
		);
		for (const s of foots) expect(s.count, s.id).toBeLessThanOrEqual(1);
	});

	test('borders belong to actions — plus the named safety accent', async () => {
		// Fewer boxes is the single biggest visual calm-down: content sections separate by whitespace,
		// and a bordered surface signals "you can act here" (the donate box; the CTA in the unlocated
		// state). Every border on a section surface or a prose element must appear in the allowlist
		// below — a border creeping onto a content section reads as clutter long before anyone names it.
		// Interactive controls (buttons, inputs, the map chrome) are out of scope: their borders are
		// affordances, not box chrome.
		const bordered = await page.evaluate(() =>
			[...document.querySelectorAll('main.content > section')].flatMap((s) => {
				const surfaces = [s, ...s.querySelectorAll(':scope > div'), ...s.querySelectorAll('p')];
				return surfaces
					.filter((el) => {
						const cs = getComputedStyle(el);
						return (
							(cs.borderTopWidth !== '0px' && cs.borderTopStyle !== 'none') ||
							(cs.borderLeftWidth !== '0px' && cs.borderLeftStyle !== 'none')
						);
					})
					.map((el) => {
						// identity from meaningful classes only — Svelte's scoped hashes are noise here
						const names = (e: Element) => [...e.classList].filter((c) => !c.startsWith('svelte-')).join('.');
						return `${names(s)} ${el.tagName}.${names(el)}`;
					});
			})
		);
		const allowed = [
			// the donate card: a bordered surface because it is an action
			/^block\.donate DIV\.card$/,
			// the eye-safety line in the verdict: a left accent bar, sanctioned emphasis — this page's one
			// piece of advice that protects eyesight is allowed to interrupt the calm (WIREFRAMES.md)
			/^block\.b1(\.total)? P\.safety$/
		];
		for (const b of bordered) {
			expect(
				allowed.some((a) => a.test(b)),
				`unsanctioned border: ${b}`
			).toBe(true);
		}
		// ...and the sanctioned ones actually exist — an allowlist entry nothing matches is a stale rule
		for (const a of allowed) {
			expect(
				bordered.some((b) => a.test(b)),
				`${a} matched nothing`
			).toBe(true);
		}
	});

	// Its own fresh page (the fixture's), not the shared one: it needs the UN-located state.
	test('holds in the unlocated state too', async ({ page: freshPage, stubGeocoder }) => {
		await stubGeocoder();
		await freshPage.goto(localeUrl());
		const strays = await freshPage.evaluate(() =>
			[...document.querySelectorAll('main.content > *')]
				.filter((el) => !(el.tagName === 'SECTION' || el.classList.contains('section-divider')))
				.map((el) => `${el.tagName}.${el.className}`)
		);
		expect(strays).toEqual([]);
	});
});
