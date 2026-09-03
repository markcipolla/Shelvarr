/**
 * E2E Tests for Settings
 */

import { test, expect } from '@playwright/test';

test.describe('Settings Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/settings');
  });

  test('should display settings heading', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /Settings/i })).toBeVisible();
  });

  test('should have tabs for different settings sections', async ({ page }) => {
    // Check for settings tabs as links (not buttons)
    await expect(page.getByRole('link', { name: /Metadata Sources/i })).toBeVisible();
    await expect(page.getByRole('link', { name: /Download Sources/i })).toBeVisible();
    await expect(page.getByRole('link', { name: /About/i })).toBeVisible();
  });

  test('should redirect to metadata sources by default', async ({ page }) => {
    // /settings should redirect to /settings/metadata
    await expect(page).toHaveURL(/\/settings\/metadata/);
  });

  test('should have Hardcover configuration on metadata tab', async ({ page }) => {
    // Should be on /settings/metadata by default
    await expect(page.getByText(/Hardcover/i)).toBeVisible();
  });

  test('should show API key status', async ({ page }) => {
    // Should show either "API key configured" or "API key required"
    await expect(
      page.getByTestId('source-hardcover').getByText(/API key configured|API key required/i)
    ).toBeVisible();
  });

  test('should navigate to Download Sources section', async ({ page }) => {
    await page.getByRole('link', { name: /Download Sources/i }).click();

    await expect(page).toHaveURL(/\/settings\/downloads/);
    await expect(page.getByText(/Configure sources for finding and downloading books/i)).toBeVisible();
  });

  test('should navigate to About section', async ({ page }) => {
    await page.getByRole('link', { name: /About/i }).click();

    await expect(page).toHaveURL(/\/settings\/about/);
    await expect(page.getByText(/Self-hosted book and comic metadata management application/i)).toBeVisible();
  });
});

test.describe('Settings - Metadata Sources', () => {
  test('should show Hardcover as a metadata source', async ({ page }) => {
    await page.goto('/settings/metadata');

    await expect(page.getByText(/Hardcover/i)).toBeVisible();
  });

  test('should allow configuring Hardcover API key', async ({ page }) => {
    await page.goto('/settings/metadata');

    const hardcover = page.getByTestId('source-hardcover');

    // Click "Add API Key" or "Update API Key" button
    const apiKeyButton = hardcover.getByRole('button', { name: /API Key/i });
    if (await apiKeyButton.isVisible()) {
      await apiKeyButton.click();

      // Now the input and Save button should be visible
      await expect(hardcover.locator('input[type="password"]')).toBeVisible();

      // Save button appears after clicking API Key button
      await expect(hardcover.getByRole('button', { name: /Save/i })).toBeVisible();
    }
  });

  test('should show ComicVine as a metadata source', async ({ page }) => {
    await page.goto('/settings/metadata');

    const comicvine = page.getByTestId('source-comicvine');
    await expect(comicvine.getByText('ComicVine')).toBeVisible();
    await expect(comicvine.getByRole('button', { name: /API Key/i })).toBeVisible();
    await expect(comicvine.getByRole('button', { name: /Test connection/i })).toBeVisible();
  });

  test('should configure the ComicVine issue date on the metadata tab', async ({ page }) => {
    await page.goto('/settings/metadata');

    const dateType = page.getByTestId('source-comicvine').getByLabel(/Issue release date/i);
    await expect(dateType).toBeVisible();
    await expect(dateType).toHaveValue(/cover_date|store_date/);
  });

  test('should not configure ComicVine on the comics tab', async ({ page }) => {
    await page.goto('/settings/comics');

    // The key moved to Metadata Sources; the comics tab only links across.
    await expect(page.locator('input[type="password"]')).toHaveCount(0);
    await expect(page.getByRole('link', { name: /Metadata Sources/i }).last()).toBeVisible();
  });
});

test.describe('Settings - Download Sources', () => {
  test('should group sources into ebook and comic sections', async ({ page }) => {
    await page.goto('/settings/downloads');

    await expect(page.getByRole('heading', { name: 'Ebooks', exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Comics', exact: true })).toBeVisible();
  });

  test('should list GetComics under the comics group', async ({ page }) => {
    await page.goto('/settings/downloads');

    const comics = page
      .locator('section')
      .filter({ has: page.getByRole('heading', { name: 'Comics', exact: true }) });
    await expect(comics.getByRole('heading', { name: 'GetComics', exact: true })).toBeVisible();
  });

  test('should list the ebook sources under the ebooks group', async ({ page }) => {
    await page.goto('/settings/downloads');

    const ebooks = page
      .locator('section')
      .filter({ has: page.getByRole('heading', { name: 'Ebooks', exact: true }) });
    await expect(ebooks.getByRole('heading', { name: 'Z-Library', exact: true })).toBeVisible();
    await expect(ebooks.getByRole('heading', { name: "Anna's Archive", exact: true })).toBeVisible();
    await expect(ebooks.getByRole('heading', { name: 'Library Genesis', exact: true })).toBeVisible();
  });

  // Rendering this page probes every source, which tests/mocks/e2e-server.mjs
  // answers. Asserting on the result keeps that wiring honest: a probe nothing
  // answers reads as "Offline", so if the mocks stop matching this fails
  // rather than the suite quietly going out to the real services. Library
  // Genesis is the interesting one — it has no domain of its own and takes the
  // best status among its mirrors.
  test('should show the status each source reported', async ({ page }) => {
    await page.goto('/settings/downloads');

    for (const source of ['annas', 'zlibrary', 'libgen', 'getcomics']) {
      await expect(page.getByTestId(`source-${source}`)).toContainText('Online');
    }
  });
});
