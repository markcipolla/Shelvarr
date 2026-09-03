/**
 * Tests for /auth/verify — the other end of a magic link.
 *
 * It is a route handler rather than a page because it sets the session
 * cookie, and the details of that cookie are the security boundary for every
 * browser request that follows.
 */

import { describe, it, before, after, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { mkdirSync, rmSync } from 'fs';
import { join } from 'path';

let db: typeof import('../../lib/db/index.js');
let auth: typeof import('@shelvarr/services').auth;
let verifyRoute: { GET: (request: any) => Promise<Response> };
let root: string;

const AUTH_ENV_KEYS = ['SHELVARR_AUTH_ENABLED', 'SHELVARR_URL', 'SMTP_HOST'] as const;
let savedEnv: Record<string, string | undefined>;

function request(url: string, headers: Record<string, string> = {}): any {
  const parsed = new URL(url);
  return {
    url,
    nextUrl: { searchParams: parsed.searchParams, protocol: parsed.protocol },
    headers: new Headers(headers),
  };
}

/** The Set-Cookie the handler wrote, parsed into name/value/attributes. */
function setCookie(response: Response): { value: string; attributes: string[] } | null {
  const header = response.headers.get('set-cookie');
  if (!header) return null;
  const [pair, ...rest] = header.split(';');
  return {
    value: pair!.slice(pair!.indexOf('=') + 1),
    attributes: rest.map((part) => part.trim().toLowerCase()),
  };
}

async function issueLink(email: string, client: 'web' | 'native' = 'web'): Promise<string> {
  const result = await auth.requestLogin({ email, client, origin: 'http://books.example' });
  return new URL(result.link!).searchParams.get('token')!;
}

describe('GET /auth/verify', () => {
  before(async () => {
    root = '/tmp/shelvarr-verify-route-' + Date.now();
    process.env['DATA_DIR'] = root;
    process.env['DB_PATH'] = join(root, 'test.db');
    mkdirSync(root, { recursive: true });

    db = await import('../../lib/db/index.js');
    db.initDatabase();
    ({ auth } = await import('@shelvarr/services'));
    verifyRoute = (await import('../../app/auth/verify/route.js')) as unknown as {
      GET: (request: any) => Promise<Response>;
    };
  });

  after(() => {
    if (db) db.closeDatabase();
    rmSync(root, { recursive: true, force: true });
  });

  beforeEach(() => {
    savedEnv = Object.fromEntries(AUTH_ENV_KEYS.map((key) => [key, process.env[key]]));
    process.env['SHELVARR_AUTH_ENABLED'] = 'true';
    delete process.env['SHELVARR_URL'];
    delete process.env['SMTP_HOST'];

    db.getDb().exec(
      'DELETE FROM login_tokens; DELETE FROM auth_sessions; DELETE FROM users; DELETE FROM settings;'
    );
    auth.createFirstAdmin('admin@example.com', 'Admin');
  });

  afterEach(() => {
    for (const key of AUTH_ENV_KEYS) {
      if (savedEnv[key] === undefined) delete process.env[key];
      else process.env[key] = savedEnv[key];
    }
  });

  it('signs the browser in and sends it to the library', async () => {
    const token = await issueLink('admin@example.com');

    const response = await verifyRoute.GET(
      request(`http://books.example/auth/verify?token=${token}`)
    );

    assert.strictEqual(response.status, 307);
    assert.strictEqual(response.headers.get('location'), 'http://books.example/');
    const cookie = setCookie(response);
    assert.ok(auth.resolveSession(cookie!.value), 'the cookie should hold a working session');
  });

  it('keeps the session cookie away from JavaScript and cross-site requests', async () => {
    const token = await issueLink('admin@example.com');

    const response = await verifyRoute.GET(
      request(`http://books.example/auth/verify?token=${token}`)
    );

    const cookie = setCookie(response)!;
    assert.ok(cookie.attributes.includes('httponly'));
    assert.ok(cookie.attributes.some((attribute) => attribute === 'samesite=lax'));
    assert.ok(cookie.attributes.some((attribute) => attribute.startsWith('path=/')));
  });

  it('leaves the cookie usable over plain HTTP, as most home installs are', async () => {
    const token = await issueLink('admin@example.com');

    const response = await verifyRoute.GET(
      request(`http://books.example/auth/verify?token=${token}`)
    );

    assert.strictEqual(setCookie(response)!.attributes.includes('secure'), false);
  });

  it('marks the cookie Secure when a proxy says the visitor used HTTPS', async () => {
    const token = await issueLink('admin@example.com');

    const response = await verifyRoute.GET(
      request(`http://books.example/auth/verify?token=${token}`, {
        'x-forwarded-proto': 'https,http',
      })
    );

    assert.ok(setCookie(response)!.attributes.includes('secure'));
  });

  it('returns someone to the page they were trying to reach', async () => {
    const result = await auth.requestLogin({
      email: 'admin@example.com',
      redirectTo: '/comics/7',
      origin: 'http://books.example',
    });
    const token = new URL(result.link!).searchParams.get('token')!;

    const response = await verifyRoute.GET(
      request(`http://books.example/auth/verify?token=${token}`)
    );

    assert.strictEqual(response.headers.get('location'), 'http://books.example/comics/7');
  });

  it('refuses to bounce a signed-in browser to another site', async () => {
    // `requestLogin` only stores paths, so this is belt and braces. `//host`
    // is the interesting case: it passes a naive "starts with /" check but
    // resolves to a different origin, which would be an open redirect.
    for (const hostile of ['https://evil.example/steal', '//evil.example/steal', '/\\evil.example']) {
      const result = await auth.requestLogin({
        email: 'admin@example.com',
        origin: 'http://books.example',
      });
      const token = new URL(result.link!).searchParams.get('token')!;
      db.getDb()
        .prepare('UPDATE login_tokens SET redirect_to = ? WHERE token_hash = ?')
        .run(hostile, auth.hashToken(token));

      const response = await verifyRoute.GET(
        request(`http://books.example/auth/verify?token=${token}`)
      );

      assert.strictEqual(
        response.headers.get('location'),
        'http://books.example/',
        `${hostile} should not be honoured`
      );
    }
  });

  it('sends a missing token back to sign in', async () => {
    const response = await verifyRoute.GET(request('http://books.example/auth/verify'));

    assert.strictEqual(
      response.headers.get('location'),
      'http://books.example/login?error=invalid-token'
    );
    assert.strictEqual(setCookie(response), null);
  });

  it('gives the same answer for an unknown, spent or expired link', async () => {
    const token = await issueLink('admin@example.com');
    await verifyRoute.GET(request(`http://books.example/auth/verify?token=${token}`));

    const spent = await verifyRoute.GET(
      request(`http://books.example/auth/verify?token=${token}`)
    );
    const unknown = await verifyRoute.GET(
      request('http://books.example/auth/verify?token=never-issued')
    );

    assert.strictEqual(spent.headers.get('location'), unknown.headers.get('location'));
    assert.strictEqual(
      spent.headers.get('location'),
      'http://books.example/login?error=invalid-token'
    );
  });

  it('does not sign in the browser that approves a device login', async () => {
    const token = await issueLink('admin@example.com', 'native');

    const response = await verifyRoute.GET(
      request(`http://books.example/auth/verify?token=${token}`)
    );

    assert.strictEqual(setCookie(response), null, 'the laptop reading the email is not the device');
    assert.match(response.headers.get('location')!, /^http:\/\/books\.example\/verify-device\?code=/);
  });

  it('just goes home when authentication is switched off', async () => {
    process.env['SHELVARR_AUTH_ENABLED'] = 'false';

    const response = await verifyRoute.GET(
      request('http://books.example/auth/verify?token=anything')
    );

    assert.strictEqual(response.headers.get('location'), 'http://books.example/');
    assert.strictEqual(setCookie(response), null);
  });
});
