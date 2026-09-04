/**
 * Compile every route the specs touch, while nothing else is running.
 *
 * These tests drive `next dev`, which builds a route the first time it is
 * asked for. Left to the specs, workers race to warm different routes at once
 * and the slowest first hit can outlast an assertion timeout —
 * /settings/downloads especially, which also waits on a status lookup for
 * every download source.
 *
 * This is a separate project rather than the tail of auth.setup.ts because the
 * two want different things from a failure. The wizard is a one-shot the run
 * depends on; warming is an idempotent optimisation that needs minutes of
 * budget on a slow runner and is safe to retry — or to give up on, at the cost
 * of a slower suite. Sharing one 30s test with the wizard meant a slow runner
 * timed out here and then spent both retries failing in the wizard instead.
 */

import { test as warm } from '@playwright/test';

const ROUTES = [
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

/** A cold compile of the heaviest route, with room to spare on a slow runner. */
const PER_ROUTE_TIMEOUT = 90_000;

warm('compiles the routes the specs use', async ({ page }) => {
  warm.setTimeout(ROUTES.length * PER_ROUTE_TIMEOUT);

  for (const route of ROUTES) {
    // One retry: a first hit that redirects can abort the navigation
    // (net::ERR_ABORTED) through no fault of the route, and the second attempt
    // has the compiled page waiting for it.
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        await page.goto(route, { waitUntil: 'domcontentloaded', timeout: PER_ROUTE_TIMEOUT });
        break;
      } catch (error) {
        // Warming is a head start, not an assertion — a route that will not
        // load is the specs' business to report, with their own expectations
        // and screenshots. Say so and move on rather than failing the run
        // before a single spec has been given a chance to run.
        if (attempt === 2) {
          console.warn(`[warm] could not warm ${route}, the specs will pay for it: ${error}`);
        }
      }
    }
  }
});
