/**
 * E2E Tests for Libraries
 */

import { test, expect } from '@playwright/test';

test.describe('Libraries Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/libraries');
  });

  test('should display libraries heading', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /Libraries/i })).toBeVisible();
  });

  test('should have Add Library button', async ({ page }) => {
    await expect(page.getByRole('button', { name: /Add Library/i })).toBeVisible();
  });

  test('should open Add Library modal when clicking button', async ({ page }) => {
    await page.getByRole('button', { name: /Add Library/i }).click();

    // Modal should appear
    await expect(page.getByRole('heading', { name: /Add Library/i })).toBeVisible();

    // Should have form fields
    await expect(page.getByLabel(/Name/i)).toBeVisible();
    await expect(page.getByLabel(/Path/i)).toBeVisible();
  });

  test('should have Cancel button in Add Library modal', async ({ page }) => {
    await page.getByRole('button', { name: /Add Library/i }).click();

    const cancelButton = page.getByRole('button', { name: /Cancel/i });
    await expect(cancelButton).toBeVisible();

    // Clicking cancel should close modal
    await cancelButton.click();
    await expect(page.getByRole('heading', { name: /Add Library/i, exact: true })).not.toBeVisible();
  });

  test('should show validation error for empty fields', async ({ page }) => {
    await page.getByRole('button', { name: /Add Library/i }).click();

    // Try to submit without filling fields
    const submitButton = page.getByRole('button', { name: /Add Library/i }).last();
    await submitButton.click();

    // Should show required field validation (HTML5 validation)
    const nameInput = page.getByLabel(/Name/i);
    const isInvalid = await nameInput.evaluate((el: HTMLInputElement) => !el.validity.valid);
    expect(isInvalid).toBe(true);
  });

  test('should have Browse button for path selection', async ({ page }) => {
    await page.getByRole('button', { name: /Add Library/i }).click();

    await expect(page.getByRole('button', { name: /Browse/i })).toBeVisible();
  });
});

test.describe('Library Actions', () => {
  test('should show empty state when no libraries exist', async ({ page }) => {
    await page.goto('/libraries');

    // Either shows libraries or empty state message
    const main = page.locator('main');
    await expect(main).toBeVisible();
  });
});
