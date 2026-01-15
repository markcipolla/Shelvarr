import { test, expect } from '@playwright/test';

test.describe('Dashboard', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#app');
  });

  test('should display the Komgarr title', async ({ page }) => {
    await expect(page.locator('h1')).toContainText('Komgarr');
  });

  test('should display dashboard content', async ({ page }) => {
    const h2 = page.locator('h2').first();
    await expect(h2).toContainText('Dashboard');
  });

  test('should have navigation links', async ({ page }) => {
    await expect(page.locator('a[data-nav="dashboard"]')).toBeAttached();
    await expect(page.locator('a[data-nav="libraries"]')).toBeAttached();
    await expect(page.locator('a[data-nav="books"]')).toBeAttached();
    await expect(page.locator('a[data-nav="settings"]')).toBeAttached();
  });

  test('should navigate to Libraries page', async ({ page }) => {
    await page.click('a[data-nav="libraries"]');
    await page.waitForURL(/\/libraries/);
    const h2 = page.locator('h2').first();
    await expect(h2).toContainText('Libraries');
  });

  test('should navigate to Settings page', async ({ page }) => {
    await page.click('a[data-nav="settings"]');
    await page.waitForURL(/\/settings/);
    const h2 = page.locator('h2').first();
    await expect(h2).toContainText('Settings');
  });
});

test.describe('Settings Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.click('a[data-nav="settings"]');
    await page.waitForURL(/\/settings/);
  });

  test('should display settings form inputs', async ({ page }) => {
    await expect(page.locator('#komga-url')).toBeAttached();
    await expect(page.locator('#komga-username')).toBeAttached();
    await expect(page.locator('#komga-password')).toBeAttached();
  });

  test('should have naming template input', async ({ page }) => {
    const template = page.locator('#naming-template');
    await expect(template).toBeAttached();
    await expect(template).toHaveValue('{author}/{series}/{title} ({year})');
  });
});

test.describe('Navigation', () => {
  test('should navigate to books page', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#app');

    await page.click('a[data-nav="books"]');
    await page.waitForURL(/\/books/);
    await expect(page.locator('h2').first()).toContainText('Books');
  });
});

test.describe('API Health', () => {
  test('should have healthy API', async ({ request }) => {
    const response = await request.get('/api/health');
    expect(response.ok()).toBeTruthy();
    const data = await response.json();
    expect(data.status).toBe('ok');
  });

  test('should return settings', async ({ request }) => {
    const response = await request.get('/api/settings');
    expect(response.ok()).toBeTruthy();
    const data = await response.json();
    expect(data._config).toBeDefined();
    expect(data._config.supportedExtensions).toBeDefined();
  });
});
