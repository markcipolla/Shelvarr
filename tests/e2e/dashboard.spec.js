/**
 * E2E Tests for Shelvarr
 *
 * NOTE: These tests were written for the old Express-based SPA.
 * The app has been migrated to Next.js App Router.
 * Tests need to be updated for:
 * - New page structure (no #app container)
 * - New navigation selectors
 * - Server Actions instead of REST API endpoints
 *
 * For now, the test:e2e script is available but tests are skipped.
 */

import { test, expect } from '@playwright/test';

test.describe('Dashboard', () => {
  test.skip('tests need migration to Next.js App Router', async ({ page }) => {
    // These tests need to be updated for the new Next.js page structure
  });
});

test.describe('API Health', () => {
  test('should have healthy API', async ({ request }) => {
    const response = await request.get('/api/health');
    expect(response.ok()).toBeTruthy();
    const data = await response.json();
    expect(data.status).toBe('ok');
  });
});
