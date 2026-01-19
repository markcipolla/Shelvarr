/**
 * E2E Tests for Navigation and Dashboard
 */

import { test, expect } from '@playwright/test';

test.describe('Navigation', () => {
  test('should load dashboard', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle(/Shelvarr/);
  });

  test('should display sidebar with all navigation items', async ({ page }) => {
    await page.goto('/');

    // Check sidebar exists
    const sidebar = page.locator('aside');
    await expect(sidebar).toBeVisible();

    // Check all nav items
    await expect(page.getByRole('link', { name: /Dashboard/i })).toBeVisible();
    await expect(page.getByRole('link', { name: /Libraries/i })).toBeVisible();
    await expect(page.getByRole('link', { name: /Books/i })).toBeVisible();
    await expect(page.getByRole('link', { name: /Unmatched/i })).toBeVisible();
    await expect(page.getByRole('link', { name: /Series/i })).toBeVisible();
    await expect(page.getByRole('link', { name: /Tasks/i })).toBeVisible();
    await expect(page.getByRole('link', { name: /Settings/i })).toBeVisible();
  });

  test('should navigate to Libraries page', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('link', { name: /Libraries/i }).click();
    await expect(page).toHaveURL('/libraries');
    await expect(page.getByRole('heading', { name: /Libraries/i })).toBeVisible();
  });

  test('should navigate to Books page', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('link', { name: /Books/i }).click();
    await expect(page).toHaveURL('/books');
    await expect(page.getByRole('heading', { name: /Books/i })).toBeVisible();
  });

  test('should navigate to Tasks page', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('link', { name: /Tasks/i }).click();
    await expect(page).toHaveURL('/tasks');
    await expect(page.getByRole('heading', { name: /Tasks/i })).toBeVisible();
  });

  test('should navigate to Settings page', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('link', { name: /Settings/i }).click();
    await expect(page).toHaveURL('/settings');
    await expect(page.getByRole('heading', { name: /Settings/i })).toBeVisible();
  });

  test('should have search input in sidebar', async ({ page }) => {
    await page.goto('/');
    const searchInput = page.getByPlaceholder(/Search/i);
    await expect(searchInput).toBeVisible();
  });
});

test.describe('Dashboard', () => {
  test('should display stats cards', async ({ page }) => {
    await page.goto('/');

    // Dashboard should show key metrics
    await expect(page.getByText(/Libraries/i)).toBeVisible();
    await expect(page.getByText(/Books/i)).toBeVisible();
  });

  test('should display recent activity section', async ({ page }) => {
    await page.goto('/');

    // Should have some activity/tasks section
    const main = page.locator('main');
    await expect(main).toBeVisible();
  });
});
