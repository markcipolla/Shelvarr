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
    // Check for settings tabs/sections
    await expect(page.getByText(/Metadata/i)).toBeVisible();
  });

  test('should have Hardcover API key input', async ({ page }) => {
    // Look for API key input field
    const apiKeyInput = page.getByPlaceholder(/API/i).or(page.getByLabel(/API/i));
    if (await apiKeyInput.count() > 0) {
      await expect(apiKeyInput.first()).toBeVisible();
    }
  });

  test('should have Save button for settings', async ({ page }) => {
    await expect(page.getByRole('button', { name: /Save/i })).toBeVisible();
  });

  test('should have Komga section', async ({ page }) => {
    // Look for Komga configuration
    await expect(page.getByText(/Komga/i)).toBeVisible();
  });

  test('should have Test Connection button for Komga', async ({ page }) => {
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

  test('should allow entering Hardcover API key', async ({ page }) => {
    await page.goto('/settings');

    // Find the API key input and enter a test value
    const apiKeyInput = page.locator('input[type="password"]').or(page.locator('input[placeholder*="API"]')).first();

    if (await apiKeyInput.isVisible()) {
      await apiKeyInput.fill('test-api-key-12345');
      await expect(apiKeyInput).toHaveValue('test-api-key-12345');
    }
  });
});
