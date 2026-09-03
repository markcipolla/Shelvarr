/**
 * First run, end to end.
 *
 * Doubles as the setup step for every other spec: it completes the wizard on
 * an empty database and saves the signed-in session for them to reuse.
 */

import { test as setup, expect } from '@playwright/test';
import { storageState } from '../../playwright.config.js';

setup('creates the first admin and signs in', async ({ page }) => {
  await page.goto('/');

  // With no accounts, every page funnels into the wizard.
  await expect(page).toHaveURL('/setup');
  await expect(page.getByRole('heading', { name: 'Welcome to Shelvarr' })).toBeVisible();

  await page.getByLabel('Your name (optional)').fill('E2E Admin');
  await page.getByLabel('Email').fill('e2e@example.com');
  await page.getByRole('button', { name: 'Create admin account' }).click();

  // The wizard signs the new admin straight in, so the library is reachable.
  await expect(page).toHaveURL('/');
  await expect(page.locator('aside')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Account' })).toBeVisible();

  await page.context().storageState({ path: storageState });

  await warmRoutes(page);
});

/**
 * Compile every route the specs touch, while nothing else is running.
 *
 * These tests drive `next dev`, which builds a route the first time it is
 * asked for. Left to the specs, several workers race to warm different routes
 * at once and the slowest first hit can outlast an assertion timeout —
 * /settings/downloads especially, which also waits on an external status
 * lookup. Doing it here, single-file, costs a few seconds and removes the
 * flake.
 */
async function warmRoutes(page: import('@playwright/test').Page) {
  const routes = [
    '/libraries',
    '/books',
    '/series',
    '/comics',
    '/wanted',
    '/authors',
    '/tasks',
    '/settings/metadata',
    '/settings/downloads',
    '/settings/about',
    '/login',
  ];

  for (const route of routes) {
    await page.goto(route, { waitUntil: 'domcontentloaded' });
  }
}
