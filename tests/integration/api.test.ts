/**
 * API Integration Tests
 *
 * NOTE: These tests were written for the old Express-based API.
 * The app has been migrated to Next.js with Server Actions.
 * These tests are skipped until converted to e2e tests using Playwright.
 *
 * See tests/e2e/ for end-to-end tests.
 */

import { describe, it } from 'node:test';

describe('API Integration Tests', () => {
  it('skipped - app migrated to Next.js (use Playwright e2e tests instead)', { skip: true }, () => {
    // These tests need to be converted to e2e tests using Playwright
    // The Express API routes no longer exist - the app now uses Next.js Server Actions
  });
});
