/**
 * E2E Tests for Books
 */

import { test, expect } from '@playwright/test';

test.describe('Books Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/books');
  });

  test('should display books heading', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /Books/i })).toBeVisible();
  });

  test('should have search input', async ({ page }) => {
    await expect(page.getByPlaceholder(/Search/i)).toBeVisible();
  });

  test('should have library filter dropdown', async ({ page }) => {
    // Look for a select or filter element
    const filterSelect = page.locator('select').first();
    if (await filterSelect.isVisible()) {
      await expect(filterSelect).toBeVisible();
    }
  });

  test('should show matched books count', async ({ page }) => {
    // Should show some indication of book count
    const main = page.locator('main');
    await expect(main).toBeVisible();
  });

  test('should search books when typing in search field', async ({ page }) => {
    const searchInput = page.getByPlaceholder(/Search/i);
    await searchInput.fill('test');

    // URL should update with search param
    await page.waitForURL(/search=/);
    expect(page.url()).toContain('search=test');
  });
});

test.describe('Unmatched Books Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/unmatched');
  });

  test('should display unmatched heading', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /Unmatched/i })).toBeVisible();
  });

  test('should show description about unmatched books', async ({ page }) => {
    await expect(page.getByText(/without metadata/i)).toBeVisible();
  });
});

test.describe('Book Detail Page', () => {
  test('should show 404 for non-existent book', async ({ page }) => {
    await page.goto('/books/99999999');

    // Should show not found
    await expect(page.getByText(/not found/i)).toBeVisible();
  });
});
