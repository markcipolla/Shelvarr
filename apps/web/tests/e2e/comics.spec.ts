/**
 * E2E Tests for Comics
 *
 * Every spec starts from the empty database auth.setup.ts leaves behind: no
 * root folders, no volumes, no downloads, no import run. These checks stay at
 * that depth — headings, empty-state messaging, and that the entry points to
 * heavier flows (adding a comic, importing a library) are reachable — rather
 * than exercising ComicVine or a real import, which need fixtures this suite
 * does not have.
 */

import { test, expect } from '@playwright/test';

test.describe('Comics Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/comics');
  });

  test('should display comics heading', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Comics' })).toBeVisible();
  });

  test('should show empty state when no volumes exist', async ({ page }) => {
    await expect(page.getByText(/No comics yet/i)).toBeVisible();
  });

  test('should have an Add comic entry point', async ({ page }) => {
    const addLink = page.locator('main').getByRole('link', { name: 'Add comic' });
    await expect(addLink).toBeVisible();

    await addLink.click();
    await expect(page).toHaveURL('/comics/add');
    await expect(page.getByRole('heading', { name: 'Add a comic' })).toBeVisible();
  });

  test('should have a Downloads entry point', async ({ page }) => {
    const downloadsLink = page.locator('main').getByRole('link', { name: 'Downloads' });
    await expect(downloadsLink).toBeVisible();

    await downloadsLink.click();
    await expect(page).toHaveURL('/comics/downloads');
    await expect(page.getByRole('heading', { name: 'Downloads' })).toBeVisible();
  });

  test('should link to importing an existing library from the empty state', async ({ page }) => {
    await page.getByRole('link', { name: /import an existing library/i }).click();
    await expect(page).toHaveURL('/settings/comics');
  });
});

test.describe('Comic Downloads Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/comics/downloads');
  });

  test('should display downloads heading', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Downloads' })).toBeVisible();
  });

  test('should show an empty queue', async ({ page }) => {
    await expect(page.getByText('Nothing downloading.')).toBeVisible();
  });

  test('should show empty history', async ({ page }) => {
    await expect(page.getByText('Nothing downloaded yet.')).toBeVisible();
  });

  test('should show an empty blocklist', async ({ page }) => {
    await expect(page.getByText('Nothing blocked.')).toBeVisible();
  });

  test('should link back to Comics', async ({ page }) => {
    await page.getByRole('link', { name: /Back to Comics/i }).click();
    await expect(page).toHaveURL('/comics');
  });
});

test.describe('Comic Library Import Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/comics/import');
  });

  test('should display the import heading', async ({ page }) => {
    await expect(
      page.getByRole('heading', { name: 'Import an existing library' })
    ).toBeVisible();
  });

  test('should show a no-scan-yet message when nothing has been scanned', async ({ page }) => {
    await expect(page.getByText(/No scan has been run yet/i)).toBeVisible();
  });

  test('should link back to Comics', async ({ page }) => {
    await page.getByRole('link', { name: /Back to Comics/i }).click();
    await expect(page).toHaveURL('/comics');
  });
});
