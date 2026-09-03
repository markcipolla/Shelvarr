/**
 * What someone without a session can see, which should be almost nothing.
 *
 * Runs with the saved session deliberately discarded; every other spec keeps it.
 */

import { test, expect } from '@playwright/test';

test.use({ storageState: { cookies: [], origins: [] } });

test.describe('Signed out', () => {
  test('sends a visitor to the sign-in page', async ({ page }) => {
    await page.goto('/');

    await expect(page).toHaveURL('/login');
    await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
  });

  test('remembers where the visitor was headed', async ({ page }) => {
    await page.goto('/comics');

    await expect(page).toHaveURL('/login?next=%2Fcomics');
  });

  test('keeps the library pages out of reach', async ({ page }) => {
    for (const path of ['/books', '/series', '/settings/metadata', '/tasks']) {
      await page.goto(path);
      await expect(page).toHaveURL(/\/login/);
    }
  });

  test('closes the setup wizard once an account exists', async ({ page }) => {
    await page.goto('/setup');

    await expect(page).toHaveURL('/login');
  });

  test('refuses the API', async ({ request }) => {
    for (const path of ['/api/comics', '/api/books', '/api/browse', '/api/libraries']) {
      const response = await request.get(path);
      expect(response.status(), `${path} should be refused`).toBe(401);
    }
  });

  test('still answers the health check, which the container needs', async ({ request }) => {
    const response = await request.get('/api/health');

    expect(response.ok()).toBeTruthy();
    expect((await response.json()).status).toBe('ok');
  });

  test('says whether this server wants a login, and nothing more', async ({ request }) => {
    const response = await request.get('/api/auth/status');

    expect(response.ok()).toBeTruthy();
    expect(await response.json()).toEqual({
      enabled: true,
      setupRequired: false,
      allowSignup: false,
      emailConfigured: false,
    });
  });

  test('gives the same answer for a known and an unknown address', async ({ request }) => {
    const known = await request.post('/api/auth/login', { data: { email: 'e2e@example.com' } });
    const unknown = await request.post('/api/auth/login', { data: { email: 'nobody@example.com' } });

    expect(await known.json()).toEqual(await unknown.json());
  });

  test('rejects a made-up sign-in link', async ({ page }) => {
    await page.goto('/auth/verify?token=not-a-real-token');

    await expect(page).toHaveURL('/login?error=invalid-token');
    await expect(page.getByText(/not valid, has expired, or has already been used/i)).toBeVisible();
  });
});
