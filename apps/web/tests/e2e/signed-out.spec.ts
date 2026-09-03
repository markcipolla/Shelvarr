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

    const [knownBody, unknownBody] = [await known.json(), await unknown.json()];
    // expiresAt differs by milliseconds between the two calls; everything
    // else has to match, or the response tells you who has an account.
    expect({ ...knownBody, expiresAt: null }).toEqual({ ...unknownBody, expiresAt: null });
  });

  test('never hands the code back to whoever asked for it', async ({ request }) => {
    const response = await request.post('/api/auth/login', {
      data: { email: 'e2e@example.com' },
    });

    expect(await response.json()).not.toHaveProperty('code');
  });

  test('rejects a made-up sign-in code', async ({ request }) => {
    const response = await request.post('/api/auth/verify', {
      data: { email: 'e2e@example.com', code: 'ZZZZZZ' },
    });

    expect(response.status()).toBe(401);
    expect((await response.json()).error).toMatch(/not right/i);
  });

  test('walks from the email step to the code step', async ({ page }) => {
    // The only spec here that needs the sign-in form to be interactive rather
    // than merely rendered. Under `next dev` with several workers warming
    // routes at once, first-hit compile plus hydration can outlast the
    // default budget.
    test.setTimeout(90_000);

    await page.goto('/login');

    // Retried: the form is a client component, and typing into it before
    // React has hydrated leaves the button disabled on an empty state.
    await expect(async () => {
      await page.getByLabel('Email').fill('e2e@example.com');
      await expect(page.getByRole('button', { name: 'Email me a code' })).toBeEnabled({
        timeout: 1000,
      });
    }).toPass();

    await page.getByRole('button', { name: 'Email me a code' }).click();

    // Six boxes, and the first one holding the caret.
    await expect(page.getByLabel('Character 1 of 6')).toBeFocused();
    await expect(page.getByLabel('Character 6 of 6')).toBeVisible();
  });
});
