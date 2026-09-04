/**
 * First run, end to end.
 *
 * Doubles as the setup step for every other spec: it completes the wizard on
 * an empty database and saves the signed-in session for them to reuse.
 */

import { test as setup, expect } from '@playwright/test';
import { storageState } from '../../playwright.config.js';

/**
 * Why a failure here cannot be retried away.
 *
 * The wizard is a one-time path and the database outlives a retry — the data
 * directory is only cleared when the run starts, and by then the dev server is
 * already up against it. So an attempt that dies after creating the admin
 * leaves every retry looking at /login with no way back in. Playwright would
 * otherwise report that as a bare URL mismatch, which says nothing about the
 * attempt that actually broke.
 */
const wizardClosed =
  'Landed on /login, so the database already has an account and the first-run ' +
  'wizard is closed. Retries cannot pass — look at the first attempt in this ' +
  'run for the real failure, and delete apps/web/tests/.e2e-data to rerun locally.';

setup('creates the first admin and signs in', async ({ page }) => {
  await page.goto('/');

  // With no accounts, every page funnels into the wizard.
  await expect(page, wizardClosed).toHaveURL('/setup');
  await expect(page.getByRole('heading', { name: 'Welcome to Shelvarr' })).toBeVisible();

  await page.getByLabel('Your name (optional)').fill('E2E Admin');
  await page.getByLabel('Email').fill('e2e@example.com');
  await page.getByRole('button', { name: 'Create admin account' }).click();

  // The wizard signs the new admin straight in, so the library is reachable.
  await expect(page).toHaveURL('/');
  await expect(page.locator('aside')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Account' })).toBeVisible();

  await page.context().storageState({ path: storageState });
});
