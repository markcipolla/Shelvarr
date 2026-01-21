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
    await expect(page.getByRole('link', { name: /Komga/i })).toBeVisible();
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
      page.getByText(/API key configured|API key required/i)
    ).toBeVisible();
  });

  test('should navigate to Komga section', async ({ page }) => {
    // Click Komga tab link
    await page.getByRole('link', { name: /Komga/i }).click();

    // Should navigate to /settings/komga
    await expect(page).toHaveURL(/\/settings\/komga/);

    // Look for Komga URL input label specifically
    await expect(page.getByText('Komga URL')).toBeVisible();
  });

  test('should have Test Connection button for Komga', async ({ page }) => {
    // Navigate to Komga section
    await page.goto('/settings/komga');

    const testButton = page.getByRole('button', { name: /Test Connection/i });
    await expect(testButton).toBeVisible();
  });

  test('should navigate to Download Sources section', async ({ page }) => {
    await page.getByRole('link', { name: /Download Sources/i }).click();

    await expect(page).toHaveURL(/\/settings\/downloads/);
    await expect(page.getByText(/Configure sources for finding and downloading books/i)).toBeVisible();
  });

  test('should navigate to About section', async ({ page }) => {
    await page.getByRole('link', { name: /About/i }).click();

    await expect(page).toHaveURL(/\/settings\/about/);
    await expect(page.getByText(/Shelvarr/i)).toBeVisible();
  });
});

test.describe('Settings - Metadata Sources', () => {
  test('should show Hardcover as a metadata source', async ({ page }) => {
    await page.goto('/settings/metadata');

    await expect(page.getByText(/Hardcover/i)).toBeVisible();
  });

  test('should allow configuring Hardcover API key', async ({ page }) => {
    await page.goto('/settings/metadata');

    // Click "Add API Key" or "Update API Key" button
    const apiKeyButton = page.getByRole('button', { name: /API Key/i });
    if (await apiKeyButton.isVisible()) {
      await apiKeyButton.click();

      // Now the input and Save button should be visible
      const apiKeyInput = page.locator('input[type="password"]');
      await expect(apiKeyInput).toBeVisible();

      // Save button appears after clicking API Key button
      await expect(page.getByRole('button', { name: /Save/i })).toBeVisible();
    }
  });
});
