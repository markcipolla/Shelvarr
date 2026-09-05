import { defineConfig, devices } from '@playwright/test';
import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

/**
 * Which server the suite drives.
 *
 * `dev` is `next dev`, which compiles each route the first time it is asked
 * for. `start` serves a production build, where there is no per-route compile
 * at all — which is what lets the worker count below go above one, and what
 * takes the suite from 65s to 12s. See docs/e2e-performance.md.
 */
const serverMode = process.env.E2E_SERVER === 'dev' ? 'dev' : 'start';

/**
 * The port the server under test listens on.
 *
 * Fixed rather than chosen here: this file is evaluated again in every worker
 * process and they all have to agree on the answer.
 */
const port = Number(process.env.E2E_PORT || 3000);
const baseURL = `http://localhost:${port}`;

/**
 * A throwaway data directory, emptied at the start of every run.
 *
 * Shelvarr now requires an account, and the first-run wizard is the only way
 * to create one without a working mail server. Starting from an empty database
 * makes that path deterministic — otherwise a second run on a developer's
 * machine would find the wizard already completed and have no way in.
 *
 * The path is derived rather than random for the same reason as the port, and
 * carries the port so two suites in one checkout get a database each. Only the
 * main process clears it: workers have TEST_WORKER_INDEX set, and by the time
 * they load this file the server is already running against that database.
 */
const dataDir = join(
  import.meta.dirname,
  'tests',
  port === 3000 ? '.e2e-data' : `.e2e-data-${port}`
);

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
  // A single worker is a `next dev` constraint, not a property of the tests:
  // one process compiling routes on demand cannot serve several cold first hits
  // without one of them outlasting an assertion. A production build has no
  // compile step, so the only ceiling is CPU — and measured, the curve flattens
  // at four (10s / 7s / 6s / 6s for 1 / 2 / 4 / 8 workers).
  workers:
    Number(process.env.E2E_WORKERS) || (serverMode === 'dev' ? (process.env.CI ? 1 : 2) : 4),
  reporter: 'html',
  use: {
    baseURL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  // Sized for `next dev`'s cold-compile stalls, which `start` mode does not
  // have. Left generous on purpose: CI agents are slower than the machine these
  // were measured on, an over-long timeout only costs anything on a failure,
  // and tightening it on laptop numbers is how a suite gets flaky on hardware
  // nobody measured.
  expect: { timeout: 15_000 },
  projects: [
    {
      // Runs the first-run wizard, then saves the resulting session for
      // everything else to reuse.
      name: 'setup',
      testMatch: /auth\.setup\.ts/,
      use: { ...devices['Desktop Chrome'], storageState: { cookies: [], origins: [] } },
    },
    // Warming only exists to pay `next dev`'s per-route compile cost up front,
    // where it can be spent once instead of stalling whichever spec happens to
    // hit a route first. A production build has nothing to compile, so in
    // `start` mode this project is not just unnecessary — it is 11 navigations
    // of pure overhead per shard.
    ...(serverMode === 'dev'
      ? [
          {
            name: 'warmup',
            testMatch: /warm\.setup\.ts/,
            dependencies: ['setup'],
            use: { ...devices['Desktop Chrome'], storageState },
          },
        ]
      : []),
    {
      name: 'chromium',
      // In dev, 'warmup' pulls 'setup' in behind it; in start mode we depend on
      // 'setup' directly. Either way the wizard runs first.
      dependencies: [serverMode === 'dev' ? 'warmup' : 'setup'],
      use: { ...devices['Desktop Chrome'], storageState },
      testIgnore: /\.setup\.ts/,
    },
  ],
  webServer: {
    command:
      serverMode === 'dev' ? `npm run dev -- --port ${port}` : `npm run start -- --port ${port}`,
    url: `${baseURL}/api/health`,
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
