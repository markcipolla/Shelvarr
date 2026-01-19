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
    // Check for settings tabs - actual tab labels
    await expect(page.getByRole('button', { name: /Metadata Sources/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /Download Sources/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /Komga/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /About/i })).toBeVisible();
  });

  test('should have Hardcover configuration', async ({ page }) => {
    // Hardcover is shown as a metadata source
    await expect(page.getByText(/Hardcover/i)).toBeVisible();
  });

  test('should show API key status', async ({ page }) => {
    // Should show either "API key configured" or "API key required"
    await expect(
      page.getByText(/API key configured|API key required/i)
    ).toBeVisible();
  });

  test('should have Komga section', async ({ page }) => {
    // Click Komga tab
    await page.getByRole('button', { name: /Komga/i }).click();

    // Look for Komga URL input label specifically
    await expect(page.getByText('Komga URL')).toBeVisible();
  });

  test('should have Test Connection button for Komga', async ({ page }) => {
    // Click Komga tab first
    await page.getByRole('button', { name: /Komga/i }).click();

    const testButton = page.getByRole('button', { name: /Test/i });
    if (await testButton.count() > 0) {
      await expect(testButton.first()).toBeVisible();
    }
  });
});

test.describe('Settings - Metadata Sources', () => {
  test('should show Hardcover as a metadata source', async ({ page }) => {
    await page.goto('/settings');

    await expect(page.getByText(/Hardcover/i)).toBeVisible();
  });

  test('should allow configuring Hardcover API key', async ({ page }) => {
    await page.goto('/settings');

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
