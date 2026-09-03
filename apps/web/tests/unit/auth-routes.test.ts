/**
 * Tests for the /api/auth/* route handlers.
 *
 * These are the endpoints the native app and any non-browser client talk to,
 * and the only ones deliberately reachable without a session — so what they
 * are willing to say to an anonymous caller matters.
 */

import { describe, it, before, after, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { mkdirSync, rmSync } from 'fs';
import { join } from 'path';

let db: typeof import('../../lib/db/index.js');
let auth: typeof import('@shelvarr/services').auth;
let root: string;

type Handler = (request: any) => Promise<Response>;

let statusRoute: { GET: () => Promise<Response> };
let sessionRoute: { GET: Handler };
let logoutRoute: { POST: Handler };
let loginRoute: { POST: Handler };
let verifyRoute: { POST: Handler };

const AUTH_ENV_KEYS = ['SHELVARR_AUTH_ENABLED', 'SHELVARR_ALLOW_SIGNUP', 'SMTP_HOST'] as const;
let savedEnv: Record<string, string | undefined>;

/** A stand-in for NextRequest carrying just what these handlers read. */
function request(options: {
  url?: string;
  headers?: Record<string, string>;
  body?: unknown;
  rawBody?: string;
} = {}): any {
  const url = options.url ?? 'http://books.example/api/auth/login';
  const parsed = new URL(url);
  return {
    url,
    nextUrl: {
      searchParams: parsed.searchParams,
      origin: parsed.origin,
      protocol: parsed.protocol,
    },
    headers: new Headers({ host: parsed.host, ...options.headers }),
    json: async () => {
      if (options.rawBody !== undefined) return JSON.parse(options.rawBody);
      if (options.body === undefined) throw new SyntaxError('no body');
      return options.body;
    },
  };
}

describe('Auth API routes', () => {
  before(async () => {
    root = '/tmp/shelvarr-auth-routes-' + Date.now();
    process.env['DATA_DIR'] = root;
    process.env['DB_PATH'] = join(root, 'test.db');
    mkdirSync(root, { recursive: true });

    db = await import('../../lib/db/index.js');
    db.initDatabase();
    ({ auth } = await import('@shelvarr/services'));

    statusRoute = await import('../../app/api/auth/status/route.js');
    sessionRoute = (await import('../../app/api/auth/session/route.js')) as unknown as {
      GET: Handler;
    };
    logoutRoute = (await import('../../app/api/auth/logout/route.js')) as unknown as {
      POST: Handler;
    };
    loginRoute = (await import('../../app/api/auth/login/route.js')) as unknown as {
      POST: Handler;
    };
    verifyRoute = (await import('../../app/api/auth/verify/route.js')) as unknown as {
      POST: Handler;
    };
  });

  after(() => {
    if (db) db.closeDatabase();
    rmSync(root, { recursive: true, force: true });
  });

  beforeEach(() => {
    savedEnv = Object.fromEntries(AUTH_ENV_KEYS.map((key) => [key, process.env[key]]));
    process.env['SHELVARR_AUTH_ENABLED'] = 'true';
    delete process.env['SHELVARR_ALLOW_SIGNUP'];
    delete process.env['SMTP_HOST'];

    db.getDb().exec(
      'DELETE FROM login_codes; DELETE FROM auth_sessions; DELETE FROM users; DELETE FROM settings;'
    );
  });

  afterEach(() => {
    for (const key of AUTH_ENV_KEYS) {
      if (savedEnv[key] === undefined) delete process.env[key];
      else process.env[key] = savedEnv[key];
    }
  });

  describe('GET /api/auth/status', () => {
    it('tells an anonymous caller that setup is still needed', async () => {
      const body = await (await statusRoute.GET()).json();

      assert.deepStrictEqual(body, {
        enabled: true,
        setupRequired: true,
        allowSignup: false,
        emailConfigured: false,
      });
    });

    it('reports authentication as off when it is', async () => {
      process.env['SHELVARR_AUTH_ENABLED'] = 'false';

      const body = await (await statusRoute.GET()).json();

      assert.strictEqual(body.enabled, false);
    });

    it('names no accounts, only whether any exist', async () => {
      auth.createFirstAdmin('admin@example.com', 'Admin');

      const body = await (await statusRoute.GET()).json();

      assert.strictEqual(body.setupRequired, false);
      assert.strictEqual(JSON.stringify(body).includes('admin@example.com'), false);
    });
  });

  describe('GET /api/auth/session', () => {
    it('401s without credentials', async () => {
      const response = await sessionRoute.GET(request());
      assert.strictEqual(response.status, 401);
    });

    it('reports the signed-in account for a bearer token', async () => {
      const user = auth.createFirstAdmin('admin@example.com', 'Admin');
      const issued = auth.issueSession(user, 'native');

      const response = await sessionRoute.GET(
        request({ headers: { Authorization: `Bearer ${issued.token}` } })
      );
      const body = await response.json();

      assert.strictEqual(response.status, 200);
      assert.strictEqual(body.user.email, 'admin@example.com');
      assert.strictEqual(body.kind, 'session');
    });

    it('reports access without an identity when authentication is off', async () => {
      process.env['SHELVARR_AUTH_ENABLED'] = 'false';

      const body = await (await sessionRoute.GET(request())).json();

      assert.deepStrictEqual(body, { user: null, kind: 'disabled' });
    });
  });

  describe('POST /api/auth/logout', () => {
    it('ends the session the request carries', async () => {
      const user = auth.createFirstAdmin('admin@example.com', null);
      const issued = auth.issueSession(user, 'native');

      const response = await logoutRoute.POST(
        request({ headers: { Authorization: `Bearer ${issued.token}` } })
      );

      assert.strictEqual(response.status, 200);
      assert.strictEqual(auth.resolveSession(issued.token), null);
    });

    it('succeeds even with no session to end', async () => {
      const response = await logoutRoute.POST(request());
      assert.strictEqual(response.status, 200);
    });
  });

  describe('POST /api/auth/login', () => {
    beforeEach(() => {
      auth.createFirstAdmin('admin@example.com', null);
    });

    it('rejects a body that is not JSON', async () => {
      const response = await loginRoute.POST(request());
      assert.strictEqual(response.status, 400);
    });

    it('rejects an address it could never deliver to', async () => {
      const response = await loginRoute.POST(request({ body: { email: 'nope' } }));
      assert.strictEqual(response.status, 400);
    });

    it('answers the same shape for a known and an unknown address', async () => {
      const known = await (
        await loginRoute.POST(request({ body: { email: 'admin@example.com' } }))
      ).json();
      const unknown = await (
        await loginRoute.POST(request({ body: { email: 'stranger@example.com' } }))
      ).json();

      assert.deepStrictEqual(Object.keys(known).sort(), Object.keys(unknown).sort());
      assert.strictEqual(known.emailSent, unknown.emailSent);
      assert.strictEqual(known.message, unknown.message);
    });

    it('never returns the code itself to an anonymous caller', async () => {
      const body = await (
        await loginRoute.POST(request({ body: { email: 'admin@example.com' } }))
      ).json();

      assert.strictEqual(body.code, undefined);
      // The stored hash is the only copy the server keeps, so nothing in the
      // response can be checked against it — which is the point.
      assert.strictEqual(body.codeLength, 6);
    });

    it('refuses when authentication is switched off', async () => {
      process.env['SHELVARR_AUTH_ENABLED'] = 'false';

      const response = await loginRoute.POST(request({ body: { email: 'admin@example.com' } }));

      assert.strictEqual(response.status, 400);
    });

    it('reports rate limiting with a 429', async () => {
      for (let attempt = 0; attempt < 5; attempt++) {
        await loginRoute.POST(request({ body: { email: 'admin@example.com' } }));
      }

      const response = await loginRoute.POST(request({ body: { email: 'admin@example.com' } }));

      assert.strictEqual(response.status, 429);
    });
  });

  describe('POST /api/auth/verify', () => {
    beforeEach(() => {
      auth.createFirstAdmin('admin@example.com', 'Admin');
    });

    /**
     * The route never reveals the code, so ask the service directly. With no
     * SMTP configured it hands the code back for exactly this reason.
     */
    async function codeFor(email = 'admin@example.com', client?: 'web' | 'native') {
      const result = await auth.requestLogin({ email, client });
      return result.code!;
    }

    function verify(body: Record<string, unknown>) {
      return verifyRoute.POST(
        request({ url: 'http://books.example/api/auth/verify', body })
      );
    }

    it('rejects a body that is not JSON', async () => {
      const response = await verifyRoute.POST(
        request({ url: 'http://books.example/api/auth/verify' })
      );
      assert.strictEqual(response.status, 400);
    });

    it('needs both an address and a code', async () => {
      assert.strictEqual((await verify({ email: 'admin@example.com' })).status, 400);
      assert.strictEqual((await verify({ code: 'ABCDEF' })).status, 400);
    });

    it('answers 401 for a code that is not right', async () => {
      await codeFor();

      const response = await verify({ email: 'admin@example.com', code: 'ZZZZZZ' });

      assert.strictEqual(response.status, 401);
      assert.ok((await response.json()).error);
    });

    it('returns a working session and sets a cookie for a browser', async () => {
      const code = await codeFor();

      const response = await verify({ email: 'admin@example.com', code });
      const body = await response.json();

      assert.strictEqual(response.status, 200);
      assert.strictEqual(body.user.email, 'admin@example.com');
      assert.ok(auth.resolveSession(body.token));
      assert.strictEqual(response.cookies.get(auth.SESSION_COOKIE_NAME)?.value, body.token);
    });

    it('leaves the cookie off a native sign-in and labels the session', async () => {
      const code = await codeFor('admin@example.com', 'native');

      const response = await verify({
        email: 'admin@example.com',
        code,
        client: 'native',
        label: 'Pixel 8',
      });
      const body = await response.json();

      assert.strictEqual(response.cookies.get(auth.SESSION_COOKIE_NAME), undefined);
      assert.strictEqual(auth.resolveSession(body.token)?.session.label, 'Pixel 8');
    });

    it('passes on where the sign-in was headed, if it is safe', async () => {
      const requested = await auth.requestLogin({
        email: 'admin@example.com',
        redirectTo: '/comics/7',
      });

      const body = await (
        await verify({ email: 'admin@example.com', code: requested.code! })
      ).json();

      assert.strictEqual(body.redirectTo, '/comics/7');
    });

    it('refuses when authentication is switched off', async () => {
      process.env['SHELVARR_AUTH_ENABLED'] = 'false';

      const response = await verify({ email: 'admin@example.com', code: 'ABCDEF' });

      assert.strictEqual(response.status, 400);
    });
  });
});
