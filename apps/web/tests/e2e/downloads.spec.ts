/**
 * E2E Tests for Book Downloads
 *
 * Mirrors comics.spec.ts's Comic Downloads Page coverage for the book side of
 * the same feature (E2-5). The empty database this suite starts from has no
 * download queue, history, or blocklist entries, so this stays at heading and
 * empty-state depth plus the entry point from Wanted, rather than exercising
 * a real download against a source.
 */

import { test, expect } from '@playwright/test';

test.describe('Downloads Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/downloads');
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

  test('should link back to Wanted', async ({ page }) => {
    await page.getByRole('link', { name: /Back to Wanted/i }).click();
    await expect(page).toHaveURL('/wanted/list');
  });
});

test.describe('Wanted Page', () => {
  test('should link to the Downloads page', async ({ page }) => {
    await page.goto('/wanted');
    await expect(page).toHaveURL('/wanted/list');

    const downloadsLink = page.getByRole('link', { name: 'Downloads' });
    await expect(downloadsLink).toBeVisible();

    await downloadsLink.click();
    await expect(page).toHaveURL('/downloads');
    await expect(page.getByRole('heading', { name: 'Downloads' })).toBeVisible();
  });
});
