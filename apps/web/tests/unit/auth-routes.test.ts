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
let deviceStartRoute: { POST: Handler };
let devicePollRoute: { POST: Handler; DELETE: Handler };

const AUTH_ENV_KEYS = ['SHELVARR_AUTH_ENABLED', 'SHELVARR_ALLOW_SIGNUP', 'SHELVARR_URL', 'SMTP_HOST'] as const;
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
    deviceStartRoute = (await import('../../app/api/auth/device/start/route.js')) as unknown as {
      POST: Handler;
    };
    devicePollRoute = (await import('../../app/api/auth/device/poll/route.js')) as unknown as {
      POST: Handler;
      DELETE: Handler;
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
    delete process.env['SHELVARR_URL'];
    delete process.env['SMTP_HOST'];

    db.getDb().exec(
      'DELETE FROM login_tokens; DELETE FROM auth_sessions; DELETE FROM users; DELETE FROM settings;'
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

    it('answers the same for a known and an unknown address', async () => {
      const known = await (
        await loginRoute.POST(request({ body: { email: 'admin@example.com' } }))
      ).json();
      const unknown = await (
        await loginRoute.POST(request({ body: { email: 'stranger@example.com' } }))
      ).json();

      assert.deepStrictEqual(known, unknown);
    });

    it('never returns the link itself to an anonymous caller', async () => {
      const body = await (
        await loginRoute.POST(request({ body: { email: 'admin@example.com' } }))
      ).json();

      assert.strictEqual(body.link, undefined);
      assert.strictEqual(JSON.stringify(body).includes('/auth/verify'), false);
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

  describe('the native device flow', () => {
    beforeEach(() => {
      auth.createFirstAdmin('admin@example.com', 'Admin');
    });

    async function start(email = 'admin@example.com') {
      const response = await deviceStartRoute.POST(
        request({ url: 'http://books.example/api/auth/device/start', body: { email } })
      );
      return { response, body: await response.json() };
    }

    it('hands the app a device code and a code to display', async () => {
      const { response, body } = await start();

      assert.strictEqual(response.status, 200);
      assert.ok(body.deviceCode);
      assert.match(body.userCode, /^[A-Z2-9]{3}-[A-Z2-9]{3}$/);
    });

    it('rejects a body that is not JSON', async () => {
      const response = await deviceStartRoute.POST(
        request({ url: 'http://books.example/api/auth/device/start' })
      );
      assert.strictEqual(response.status, 400);
    });

    it('rejects an unusable address', async () => {
      const { response } = await start('nope');
      assert.strictEqual(response.status, 400);
    });

    it('withholds a device code for an unknown address, without saying so', async () => {
      const { response, body } = await start('stranger@example.com');

      assert.strictEqual(response.status, 202);
      assert.strictEqual(body.deviceCode, null);
      assert.strictEqual(body.error, undefined);
    });

    it('stays pending until the emailed link is opened', async () => {
      const { body } = await start();

      const poll = await (
        await devicePollRoute.POST(
          request({
            url: 'http://books.example/api/auth/device/poll',
            body: { deviceCode: body.deviceCode },
          })
        )
      ).json();

      assert.deepStrictEqual(poll, { status: 'pending' });
    });

    it('returns a working session once the link has been opened', async () => {
      const { body } = await start();
      // Stands in for someone opening the emailed link in a browser, which
      // is the only thing that marks a device request approved. The plaintext
      // token is unrecoverable by design, so it cannot be replayed here.
      db.getDb().prepare('UPDATE login_tokens SET consumed_at = CURRENT_TIMESTAMP').run();

      const poll = await (
        await devicePollRoute.POST(
          request({
            url: 'http://books.example/api/auth/device/poll',
            body: { deviceCode: body.deviceCode, label: 'Pixel 8' },
          })
        )
      ).json();

      assert.strictEqual(poll.status, 'approved');
      assert.strictEqual(auth.resolveSession(poll.token)?.session.label, 'Pixel 8');
    });

    it('needs a device code to poll with', async () => {
      const response = await devicePollRoute.POST(
        request({ url: 'http://books.example/api/auth/device/poll', body: {} })
      );

      assert.strictEqual(response.status, 400);
    });

    it('lets the app cancel, which kills the emailed link', async () => {
      const { body } = await start();

      const response = await devicePollRoute.DELETE(
        request({
          url: `http://books.example/api/auth/device/poll?deviceCode=${encodeURIComponent(body.deviceCode)}`,
        })
      );

      assert.deepStrictEqual(await response.json(), { cancelled: true });
      const poll = await (
        await devicePollRoute.POST(
          request({
            url: 'http://books.example/api/auth/device/poll',
            body: { deviceCode: body.deviceCode },
          })
        )
      ).json();
      assert.deepStrictEqual(poll, { status: 'expired' });
    });

    it('needs a device code to cancel', async () => {
      const response = await devicePollRoute.DELETE(
        request({ url: 'http://books.example/api/auth/device/poll' })
      );

      assert.strictEqual(response.status, 400);
    });

    it('refuses the whole flow when authentication is switched off', async () => {
      process.env['SHELVARR_AUTH_ENABLED'] = 'false';

      const { response } = await start();
      const pollResponse = await devicePollRoute.POST(
        request({
          url: 'http://books.example/api/auth/device/poll',
          body: { deviceCode: 'anything' },
        })
      );

      assert.strictEqual(response.status, 400);
      assert.strictEqual(pollResponse.status, 400);
    });
  });
});
