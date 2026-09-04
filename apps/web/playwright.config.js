import { defineConfig, devices } from '@playwright/test';
import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

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
      // Compiles the routes the specs use, signed in, before they start. See
      // tests/e2e/warm.setup.ts.
      name: 'warmup',
      testMatch: /warm\.setup\.ts/,
      dependencies: ['setup'],
      use: { ...devices['Desktop Chrome'], storageState },
    },
    {
      name: 'chromium',
      // 'warmup' pulls 'setup' in behind it, so the wizard still runs first.
      dependencies: ['warmup'],
      use: { ...devices['Desktop Chrome'], storageState },
      testIgnore: /\.setup\.ts/,
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
      // Page renders reach out too — /settings/downloads probes every download
      // source to report its status. That happens on the server side of the
      // suite, out of reach of page.route(), so both the mocks and the guard
      // behind them have to load in the dev server. NODE_OPTIONS is the only
      // way in to a process Playwright spawns for us.
      //
      // Order matters. Whichever of the two patches fetch last ends up
      // outermost and runs first, and we want msw to have the first look:
      // requests it has a handler for are answered, and the rest fall through
      // to the guard, which blocks them. File URLs keep the paths intact if
      // the checkout has spaces in it.
      //
      // --import=<url> rather than --import <url>: next dev passes NODE_OPTIONS
      // on to a child process, and with two space-separated flags the child
      // reads the second path as part of the first one's value and dies.
      NODE_OPTIONS: [
        process.env.NODE_OPTIONS,
        ...['no-network.mjs', join('mocks', 'e2e-server.mjs')].map(
          (file) => `--import=${pathToFileURL(join(import.meta.dirname, 'tests', file)).href}`
        ),
      ]
        .filter(Boolean)
        .join(' '),
      NEXT_TELEMETRY_DISABLED: '1',
    },
  },
});

export { storageState };
