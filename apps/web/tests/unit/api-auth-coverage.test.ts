/**
 * A guard rail rather than a behaviour test: every route handler must check
 * authentication, and the handful that must not are listed here explicitly.
 *
 * Adding a route without a check is an easy mistake and a quiet one — the
 * route works perfectly, it is just readable by anyone who can reach the
 * port. This fails the build instead.
 *
 * The whole of `app/` is scanned, not just `app/api/`: a handler outside the
 * API namespace is no less reachable, and one that the scan could not see
 * would be exactly the blind spot this file exists to close.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import { readFileSync, readdirSync } from 'fs';
import { join, relative } from 'path';

const appRoot = join(import.meta.dirname, '..', '..', 'app');

/**
 * Routes that are reachable without signing in, and why.
 *
 * Every one of these is part of getting signed in or of finding out whether
 * you need to be. None of them reveal anything about the library.
 */
const PUBLIC_ROUTES: Record<string, string> = {
  'up/route.ts': 'the container asks whether it may take traffic, before anyone signs in',
  'api/health/route.ts': 'the same answer in JSON; the native connection test reads it',
  'api/auth/status/route.ts': 'a client must learn whether this server wants a login',
  'api/auth/login/route.ts': 'asking for a sign-in code is by definition unauthenticated',
  'api/auth/logout/route.ts': 'ending a session must work even with a dead token',
  'api/auth/session/route.ts': 'answers 401 itself rather than deferring to the shared gate',
  'api/auth/verify/route.ts': 'the emailed code is the credential here',
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
  const routes = findRoutes(appRoot);

  it('finds the route handlers to check', () => {
    assert.ok(routes.length > 40, `expected to find the route handlers, found ${routes.length}`);
  });

  for (const route of routes) {
    const name = relative(appRoot, route).split('\\').join('/');
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
      // `authoriseAdminRequest` is the diagnostics gate: a stricter one than
      // `validateApiAuth`, since it also demands the feature be switched on
      // and the caller be an admin. `requireSessionUser` is the cookie gate,
      // for the routes a browser opens itself and so cannot send a key header
      // on — the live event stream is the one that needs it.
      assert.match(
        source,
        /validateApiAuth\(|authenticateRequest\(|authoriseAdminRequest\(|requireSessionUser\(/,
        `${name} serves requests without checking who is asking. Add a ` +
          'validateApiAuth guard, or list it in PUBLIC_ROUTES with a reason.'
      );
    });
  }
});
