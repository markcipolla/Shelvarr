import { defineConfig, devices } from '@playwright/test';
import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';

/**
 * A throwaway data directory, emptied at the start of every run.
 *
 * Shelvarr now requires an account, and the first-run wizard is the only way
 * to create one without a working mail server. Starting from an empty database
 * makes that path deterministic — otherwise a second run on a developer's
 * machine would find the wizard already completed and have no way in.
 *
 * The path is fixed rather than random because Playwright evaluates this file
 * again in every worker process, and they all need to agree on it. Only the
 * main process clears it: workers have TEST_WORKER_INDEX set, and by the time
 * they load this file the server is already running against that database.
 */
const dataDir = join(import.meta.dirname, 'tests', '.e2e-data');

if (process.env.TEST_WORKER_INDEX === undefined) {
  rmSync(dataDir, { recursive: true, force: true });
}
mkdirSync(dataDir, { recursive: true });

/** Where the signed-in browser state from tests/e2e/auth.setup.ts is kept. */
const storageState = join(dataDir, 'storage-state.json');

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  // These drive `next dev`, which compiles routes on demand and serves them
  // from one process. Playwright's default of half the CPUs overloads it: the
  // slowest first hit on a page outlasts an assertion, or a click lands before
  // React has hydrated. Two keeps it honest without giving up all the speed.
  workers: process.env.CI ? 1 : 2,
  reporter: 'html',
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  // These run against `next dev`, which compiles each route the first time it
  // is asked for. With several workers warming different routes at once the
  // default 5s is not enough for the first hit on a page.
  expect: { timeout: 15_000 },
  projects: [
    {
      // Runs the first-run wizard, then saves the resulting session for
      // everything else to reuse.
      name: 'setup',
      testMatch: /auth\.setup\.ts/,
      use: { ...devices['Desktop Chrome'], storageState: { cookies: [], origins: [] } },
    },
    {
      name: 'chromium',
      dependencies: ['setup'],
      use: { ...devices['Desktop Chrome'], storageState },
      testIgnore: /auth\.setup\.ts/,
    },
  ],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000/api/health',
    reuseExistingServer: !process.env.CI,
    timeout: 120 * 1000,
    env: {
      DATA_DIR: dataDir,
      SHELVARR_AUTH_ENABLED: 'true',
      // Recurring jobs would reach out to ComicVine and GetComics mid-test.
      SCHEDULER_ENABLED: 'false',
    },
  },
});

export { storageState };
