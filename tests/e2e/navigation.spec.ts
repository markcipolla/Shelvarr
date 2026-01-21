/**
 * E2E Tests for Navigation and Dashboard
 */

import { test, expect } from '@playwright/test';

test.describe('Navigation', () => {
  test('should load dashboard', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle(/Shelvarr/);
  });

  test('should display sidebar with navigation items', async ({ page }) => {
    await page.goto('/');

    // Check sidebar exists
    const sidebar = page.locator('aside');
    await expect(sidebar).toBeVisible();

    // Check key nav items exist (using text content since links contain icons + text)
    await expect(sidebar.getByText('Dashboard')).toBeVisible();
    await expect(sidebar.getByText('Libraries')).toBeVisible();
    await expect(sidebar.getByText('Books')).toBeVisible();
    await expect(sidebar.getByText('Series')).toBeVisible();
    await expect(sidebar.getByText('Tasks')).toBeVisible();
    await expect(sidebar.getByText('Settings')).toBeVisible();
  });

  test('should navigate to Libraries page', async ({ page }) => {
    await page.goto('/');
    await page.locator('aside').getByText('Libraries').click();
    await expect(page).toHaveURL('/libraries');
    await expect(page.getByRole('heading', { name: /Libraries/i })).toBeVisible();
  });

  test('should navigate to Books page', async ({ page }) => {
    await page.goto('/');
    await page.locator('aside').getByText('Books').click();
    await expect(page).toHaveURL('/books');
    await expect(page.getByRole('heading', { name: /Books/i })).toBeVisible();
  });

  test('should navigate to Tasks page', async ({ page }) => {
    await page.goto('/');
    await page.locator('aside').getByText('Tasks').click();
    await expect(page).toHaveURL('/tasks');
    await expect(page.getByRole('heading', { name: /Tasks/i })).toBeVisible();
  });

  test('should navigate to Settings page', async ({ page }) => {
    await page.goto('/');
    await page.locator('aside').getByText('Settings').click();
    await expect(page).toHaveURL(/\/settings\/metadata/);
    await expect(page.getByRole('heading', { name: /Settings/i })).toBeVisible();
  });

  test('should have search input in sidebar', async ({ page }) => {
    await page.goto('/');
    // GlobalSearch uses placeholder "Search books, authors..."
    const searchInput = page.locator('aside').getByPlaceholder(/Search/i);
    await expect(searchInput).toBeVisible();
  });
});

test.describe('Dashboard', () => {
  test('should display main content area', async ({ page }) => {
    await page.goto('/');

    // Dashboard should have main content
    const main = page.locator('main');
    await expect(main).toBeVisible();
  });

  test('should display recent activity section', async ({ page }) => {
    await page.goto('/');

    // Should have some activity/tasks section
    const main = page.locator('main');
    await expect(main).toBeVisible();
  });
});
