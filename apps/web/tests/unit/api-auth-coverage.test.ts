/**
 * A guard rail rather than a behaviour test: every API route must check
 * authentication, and the handful that must not are listed here explicitly.
 *
 * Adding a route without a check is an easy mistake and a quiet one — the
 * route works perfectly, it is just readable by anyone who can reach the
 * port. This fails the build instead.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import { readFileSync, readdirSync } from 'fs';
import { join, relative } from 'path';

const apiRoot = join(import.meta.dirname, '..', '..', 'app', 'api');

/**
 * Routes that are reachable without signing in, and why.
 *
 * Every one of these is part of getting signed in or of finding out whether
 * you need to be. None of them reveal anything about the library.
 */
const PUBLIC_ROUTES: Record<string, string> = {
  'health/route.ts': 'the Docker healthcheck and the native connection test call it first',
  'auth/status/route.ts': 'a client must learn whether this server wants a login',
  'auth/login/route.ts': 'asking for a sign-in code is by definition unauthenticated',
  'auth/logout/route.ts': 'ending a session must work even with a dead token',
  'auth/session/route.ts': 'answers 401 itself rather than deferring to the shared gate',
  'auth/verify/route.ts': 'the emailed code is the credential here',
};

function findRoutes(directory: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) found.push(...findRoutes(path));
    else if (entry.name === 'route.ts') found.push(path);
  }
  return found;
}

describe('API authentication coverage', () => {
  const routes = findRoutes(apiRoot);

  it('finds the API routes to check', () => {
    assert.ok(routes.length > 40, `expected to find the API routes, found ${routes.length}`);
  });

  for (const route of routes) {
    const name = relative(apiRoot, route).split('\\').join('/');
    const reason = PUBLIC_ROUTES[name];

    if (reason) {
      it(`leaves ${name} public: ${reason}`, () => {
        // Nothing to assert beyond the deliberate listing; the point is that
        // opening a route takes an edit to this file and a stated reason.
        assert.ok(reason.length > 0);
      });
      continue;
    }

    it(`checks authentication in ${name}`, () => {
      const source = readFileSync(route, 'utf-8');
      assert.match(
        source,
        /validateApiAuth\(|authenticateRequest\(/,
        `${name} serves requests without checking who is asking. Add a ` +
          'validateApiAuth guard, or list it in PUBLIC_ROUTES with a reason.'
      );
    });
  }
});
