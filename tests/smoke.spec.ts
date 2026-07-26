import { test, expect } from '@playwright/test';

test('home page renders the app shell', async ({ page }) => {
	await page.goto('/');
	// brand title in the header — same string in every locale
	await expect(page.getByText('Eclipse 2026').first()).toBeVisible();
});
