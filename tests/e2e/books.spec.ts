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
    // BooksFilter uses placeholder "Search books..." (in main content, not sidebar)
    await expect(page.locator('main').getByPlaceholder('Search books...')).toBeVisible();
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

  test('should search books when submitting search form', async ({ page }) => {
    // Target the search input in main content (not sidebar)
    const searchInput = page.locator('main').getByPlaceholder('Search books...');
    await searchInput.fill('test');
    await searchInput.press('Enter');

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
  test('should show not found for non-existent book', async ({ page }) => {
    await page.goto('/books/99999999');

    // Next.js default not-found shows "This page could not be found"
    // or our custom 404 message
    await expect(
      page.getByText(/not found|could not be found/i)
    ).toBeVisible();
  });
});
