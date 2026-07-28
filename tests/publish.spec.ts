import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { test, expect, BASE } from './fixtures';

/**
 * The datajournal.org publishing contract, pinned where it can fail loudly on every run instead of only
 * in the release job: the server serves this site straight out of a .tar.zst of build/ — exactly one
 * asset, index.html + meta.json + preview at the archive ROOT, no hidden files, and every path short
 * enough for the classic ustar name field (~100 chars; longer paths truncate silently and 404).
 * Playwright has already built the site (its webServer runs `npm run build`), so build/ is fresh here.
 */
test.describe('datajournal.org publishing contract', () => {
	test('serves a complete meta.json', async ({ request }) => {
		const res = await request.get(`${BASE}/meta.json`);
		expect(res.status()).toBe(200);
		const meta = await res.json();
		for (const field of ['title', 'description', 'author', 'published', 'preview']) {
			expect(meta[field], field).toBeTruthy();
		}
		expect(meta.title).toBe('Eclipse 2026');
		expect(meta.published).toMatch(/^\d{4}-\d{2}-\d{2}$/);
	});

	test('the preview image exists and meets the 600×315 minimum', async ({ page, request }) => {
		const meta = await (await request.get(`${BASE}/meta.json`)).json();
		const res = await request.get(`${BASE}/${meta.preview}`);
		expect(res.status(), meta.preview).toBe(200);
		await page.goto(`${BASE}/en/`);
		const size = await page.evaluate(
			(src) =>
				new Promise<{ w: number; h: number }>((resolve, reject) => {
					const img = new Image();
					img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
					img.onerror = reject;
					img.src = src;
				}),
			`${BASE}/${meta.preview}`
		);
		expect(size.w).toBeGreaterThanOrEqual(600);
		expect(size.h).toBeGreaterThanOrEqual(315);
	});

	test('the archive-root files exist in the build output', () => {
		for (const f of ['index.html', 'meta.json', 'og.jpg']) {
			expect(() => statSync(join('build', f)), f).not.toThrow();
		}
	});

	test('no path in the archive exceeds the ustar name field', () => {
		// Walk build/ the way the tar will see it (relative paths, hidden entries excluded by the
		// release job's --exclude='.*'). 95 keeps a margin under the ~100-char ustar limit.
		const tooLong: string[] = [];
		const walk = (dir: string, rel: string) => {
			for (const name of readdirSync(dir)) {
				if (name.startsWith('.')) continue; // excluded from the archive
				const abs = join(dir, name);
				const relPath = rel ? `${rel}/${name}` : name;
				if (statSync(abs).isDirectory()) walk(abs, relPath);
				else if (relPath.length > 95) tooLong.push(`${relPath} (${relPath.length})`);
			}
		};
		walk('build', '');
		expect(tooLong).toEqual([]);
	});

	test('meta.json survives into the localized pages’ host', async ({ request }) => {
		// The archive is served at https://datajournal.org/eclipse-2026/ — same base the site is built
		// for, so the prerendered absolute URLs already point at the primary. Spot-check one.
		const html = await (await request.get(`${BASE}/de/`)).text();
		expect(html).toContain('https://datajournal.org/eclipse-2026/');
	});
});
