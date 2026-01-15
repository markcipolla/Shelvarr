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

  test('should have libraries navigation link', async ({ page }) => {
    await expect(page.locator('a[data-nav="libraries"]')).toBeAttached();
  });

  test('should have settings navigation link', async ({ page }) => {
    await expect(page.locator('a[data-nav="settings"]')).toBeAttached();
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

test.describe('Library API', () => {
  test('should list libraries', async ({ request }) => {
    const response = await request.get('/api/libraries');
    expect(response.ok()).toBeTruthy();
    const data = await response.json();
    expect(data.libraries).toBeDefined();
    expect(Array.isArray(data.libraries)).toBe(true);
  });

  test('should return validation error for invalid library', async ({ request }) => {
    const response = await request.post('/api/libraries', {
      data: { name: 'Test' }, // missing path
    });
    expect(response.status()).toBe(400);
    const data = await response.json();
    expect(data.error).toBeDefined();
  });
});

test.describe('Books API', () => {
  test('should list books with pagination info', async ({ request }) => {
    const response = await request.get('/api/books');
    expect(response.ok()).toBeTruthy();
    const data = await response.json();
    expect(data.books).toBeDefined();
    expect(data.total).toBeDefined();
    expect(data.page).toBeDefined();
    expect(data.pageSize).toBeDefined();
    expect(data.totalPages).toBeDefined();
  });

  test('should accept search parameter', async ({ request }) => {
    const response = await request.get('/api/books?search=test');
    expect(response.ok()).toBeTruthy();
  });

  test('should accept pagination parameters', async ({ request }) => {
    const response = await request.get('/api/books?page=1&pageSize=10');
    expect(response.ok()).toBeTruthy();
    const data = await response.json();
    expect(data.page).toBe(1);
    expect(data.pageSize).toBe(10);
  });
});
