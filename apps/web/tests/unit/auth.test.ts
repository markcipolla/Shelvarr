/**
 * Unit tests for user accounts and passwordless authentication.
 *
 * These run against a real SQLite database — the auth rules live in SQL as
 * much as in TypeScript (single-use codes, expiry, the last-admin guard), so
 * mocking the database would test the wrong thing.
 */

import { describe, it, before, after, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { mkdirSync, rmSync } from 'fs';
import { join } from 'path';

let db: typeof import('../../lib/db/index.js');
let auth: typeof import('@shelvarr/services').auth;
let root: string;

/** Env vars the auth config reads, restored after each test that changes them. */
const AUTH_ENV_KEYS = [
  'SHELVARR_AUTH_ENABLED',
  'SHELVARR_ALLOW_SIGNUP',
  'SHELVARR_LOGIN_CODE_TTL',
  'SHELVARR_SESSION_TTL',
  'SMTP_HOST',
  'SMTP_FROM',
] as const;

let savedEnv: Record<string, string | undefined>;

function headers(values: Record<string, string> = {}): Headers {
  return new Headers(values);
}

describe('Authentication', () => {
  before(async () => {
    root = '/tmp/shelvarr-auth-test-' + Date.now();
    process.env['DATA_DIR'] = root;
    process.env['DB_PATH'] = join(root, 'test.db');
    mkdirSync(root, { recursive: true });

    db = await import('../../lib/db/index.js');
    db.initDatabase();

    ({ auth } = await import('@shelvarr/services'));
  });

  after(() => {
    if (db) db.closeDatabase();
    rmSync(root, { recursive: true, force: true });
  });

  beforeEach(() => {
    savedEnv = Object.fromEntries(AUTH_ENV_KEYS.map((key) => [key, process.env[key]]));
    delete process.env['SMTP_HOST'];
    process.env['SHELVARR_AUTH_ENABLED'] = 'true';
    delete process.env['SHELVARR_ALLOW_SIGNUP'];

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

  describe('configuration', () => {
    it('is on unless explicitly switched off', () => {
      delete process.env['SHELVARR_AUTH_ENABLED'];
      assert.strictEqual(auth.isAuthEnabled(), true);
    });

    it('treats false, 0, no and off as off', () => {
      for (const value of ['false', '0', 'no', 'off', 'OFF']) {
        process.env['SHELVARR_AUTH_ENABLED'] = value;
        assert.strictEqual(auth.isAuthEnabled(), false, `expected ${value} to disable auth`);
      }
    });

    it('keeps self-signup off by default', () => {
      assert.strictEqual(auth.isSignupAllowed(), false);
    });

    it('takes its starting value for self-signup from the environment', () => {
      process.env['SHELVARR_ALLOW_SIGNUP'] = 'true';
      assert.strictEqual(auth.isSignupAllowed(), true);
    });

    it('lets a stored decision override the environment default', () => {
      process.env['SHELVARR_ALLOW_SIGNUP'] = 'true';
      auth.setSignupAllowed(false);
      assert.strictEqual(auth.isSignupAllowed(), false);
    });
  });

  describe('first-run setup', () => {
    it('reports setup as required while there are no accounts', () => {
      assert.strictEqual(auth.isSetupRequired(), true);
      assert.strictEqual(auth.getAuthStatus().setupRequired, true);
    });

    it('creates the first account as an admin', () => {
      const user = auth.createFirstAdmin('Admin@Example.com ', ' Ada ');

      assert.strictEqual(user.role, 'admin');
      assert.strictEqual(user.email, 'admin@example.com', 'email should be normalized');
      assert.strictEqual(user.name, 'Ada');
      assert.strictEqual(auth.isSetupRequired(), false);
    });

    it('refuses a second run once an account exists', () => {
      auth.createFirstAdmin('admin@example.com', null);

      assert.throws(
        () => auth.createFirstAdmin('someone-else@example.com', null),
        (error: unknown) =>
          error instanceof auth.AuthError && error.code === 'setup-complete'
      );
    });

    it('rejects an email it cannot deliver to', () => {
      assert.throws(
        () => auth.createFirstAdmin('not-an-email', null),
        (error: unknown) => error instanceof auth.AuthError && error.code === 'invalid-email'
      );
    });

    it('reports setup as done when authentication is switched off', () => {
      process.env['SHELVARR_AUTH_ENABLED'] = 'false';
      const status = auth.getAuthStatus();

      assert.strictEqual(status.enabled, false);
      assert.strictEqual(status.setupRequired, false);
    });
  });

  describe('accounts', () => {
    beforeEach(() => {
      auth.createFirstAdmin('admin@example.com', 'Admin');
    });

    it('treats email as case-insensitive when creating', () => {
      assert.throws(
        () => auth.createAccount('ADMIN@example.com', null),
        (error: unknown) => error instanceof auth.AuthError && error.code === 'email-taken'
      );
    });

    it('finds an account regardless of the case it is asked about', () => {
      const found = auth.getUserByEmail('ADMIN@EXAMPLE.COM');
      assert.strictEqual(found?.email, 'admin@example.com');
    });

    it('will not remove the only admin', () => {
      const admin = auth.getUserByEmail('admin@example.com')!;

      assert.throws(
        () => auth.removeAccount(admin.id),
        (error: unknown) => error instanceof auth.AuthError && error.code === 'last-admin'
      );
    });

    it('will not demote the only admin', () => {
      const admin = auth.getUserByEmail('admin@example.com')!;

      assert.throws(
        () => auth.setRole(admin.id, 'user'),
        (error: unknown) => error instanceof auth.AuthError && error.code === 'last-admin'
      );
    });

    it('allows demotion once a second admin exists', () => {
      const admin = auth.getUserByEmail('admin@example.com')!;
      auth.createAccount('second@example.com', null, 'admin');

      auth.setRole(admin.id, 'user');

      assert.strictEqual(auth.getUserById(admin.id)?.role, 'user');
    });

    it('ends every session held by a removed account', () => {
      const member = auth.createAccount('member@example.com', null);
      const issued = auth.issueSession(member, 'web');
      auth.createAccount('second-admin@example.com', null, 'admin');

      auth.removeAccount(member.id);

      assert.strictEqual(auth.resolveSession(issued.token), null);
    });
  });

  describe('sessions', () => {
    it('resolves a freshly issued token to its owner', () => {
      const user = auth.createFirstAdmin('admin@example.com', null);
      const issued = auth.issueSession(user, 'web', 'Firefox');

      const resolved = auth.resolveSession(issued.token);

      assert.strictEqual(resolved?.user.id, user.id);
      assert.strictEqual(resolved?.session.client, 'web');
      assert.strictEqual(resolved?.session.label, 'Firefox');
    });

    it('stores only a hash, never the token itself', () => {
      const user = auth.createFirstAdmin('admin@example.com', null);
      const issued = auth.issueSession(user, 'web');

      const rows = db
        .getDb()
        .prepare('SELECT token_hash FROM auth_sessions')
        .all() as Array<{ token_hash: string }>;

      assert.strictEqual(rows.length, 1);
      assert.notStrictEqual(rows[0]!.token_hash, issued.token);
      assert.strictEqual(rows[0]!.token_hash, auth.hashToken(issued.token));
    });

    it('records the moment of sign-in on the account', () => {
      const user = auth.createFirstAdmin('admin@example.com', null);
      assert.strictEqual(user.lastLoginAt, null);

      auth.issueSession(user, 'web');

      assert.ok(auth.getUserById(user.id)?.lastLoginAt);
    });

    it('rejects an unknown or empty token', () => {
      assert.strictEqual(auth.resolveSession('nonsense'), null);
      assert.strictEqual(auth.resolveSession(''), null);
      assert.strictEqual(auth.resolveSession(null), null);
    });

    it('rejects a revoked token', () => {
      const user = auth.createFirstAdmin('admin@example.com', null);
      const issued = auth.issueSession(user, 'web');

      assert.strictEqual(auth.revokeSessionToken(issued.token), true);
      assert.strictEqual(auth.resolveSession(issued.token), null);
    });

    it('rejects an expired token and clears it away', () => {
      const user = auth.createFirstAdmin('admin@example.com', null);
      const issued = auth.issueSession(user, 'web');

      db.getDb()
        .prepare("UPDATE auth_sessions SET expires_at = datetime('now', '-1 second')")
        .run();

      assert.strictEqual(auth.resolveSession(issued.token), null);
      const remaining = db.getDb().prepare('SELECT COUNT(*) AS c FROM auth_sessions').get() as {
        c: number;
      };
      assert.strictEqual(remaining.c, 0);
    });

    it('gives a native session a longer life than a browser one', () => {
      const user = auth.createFirstAdmin('admin@example.com', null);

      const web = auth.issueSession(user, 'web');
      const native = auth.issueSession(user, 'native');

      assert.ok(
        native.session.expiresAt > web.session.expiresAt,
        'a phone should stay signed in longer than a browser'
      );
    });

    it('will not let one person revoke another person’s session', () => {
      const admin = auth.createFirstAdmin('admin@example.com', null);
      const other = auth.createAccount('other@example.com', null);
      const theirs = auth.issueSession(other, 'web');

      assert.strictEqual(auth.revokeSession(theirs.session.id, admin.id), false);
      assert.ok(auth.resolveSession(theirs.token));
    });
  });

  describe('housekeeping', () => {
    it('clears out timed-out sessions and unused codes', async () => {
      const user = auth.createFirstAdmin('admin@example.com', null);
      const live = auth.issueSession(user, 'web');
      auth.issueSession(user, 'native');
      await auth.requestLogin({ email: 'admin@example.com' });

      db.getDb()
        .prepare(
          `UPDATE auth_sessions SET expires_at = datetime('now', '-1 day')
           WHERE token_hash != ?`
        )
        .run(auth.hashToken(live.token));
      db.getDb().prepare("UPDATE login_codes SET expires_at = datetime('now', '-1 day')").run();

      const removed = auth.pruneExpired();

      assert.strictEqual(removed.sessions, 1);
      assert.strictEqual(removed.loginCodes, 1);
      assert.ok(auth.resolveSession(live.token), 'a live session must survive the sweep');
    });

    it('leaves everything alone when nothing has timed out', () => {
      const user = auth.createFirstAdmin('admin@example.com', null);
      auth.issueSession(user, 'web');

      assert.deepStrictEqual(auth.pruneExpired(), { sessions: 0, loginCodes: 0 });
    });
  });

  describe('request authentication', () => {
    it('lets everything through when authentication is off', () => {
      process.env['SHELVARR_AUTH_ENABLED'] = 'false';

      assert.deepStrictEqual(auth.authenticateRequest(headers()), { kind: 'disabled' });
    });

    it('refuses an unauthenticated request when authentication is on', () => {
      assert.strictEqual(auth.authenticateRequest(headers()), null);
    });

    it('accepts a bearer token', () => {
      const user = auth.createFirstAdmin('admin@example.com', null);
      const issued = auth.issueSession(user, 'native');

      const result = auth.authenticateRequest(
        headers({ Authorization: `Bearer ${issued.token}` })
      );

      assert.strictEqual(result?.kind, 'session');
      assert.strictEqual(result.kind === 'session' ? result.user.id : null, user.id);
    });

    it('accepts a session cookie', () => {
      const user = auth.createFirstAdmin('admin@example.com', null);
      const issued = auth.issueSession(user, 'web');

      const result = auth.authenticateRequest(
        headers({ Cookie: `other=1; ${auth.SESSION_COOKIE_NAME}=${issued.token}; x=2` })
      );

      assert.strictEqual(result?.kind, 'session');
    });

    it('still honours the shared API key, for scripts that predate accounts', () => {
      db.setSetting('api_key', 'legacy-key');

      assert.deepStrictEqual(auth.authenticateRequest(headers({ 'X-API-Key': 'legacy-key' })), {
        kind: 'api-key',
      });
      assert.strictEqual(auth.authenticateRequest(headers({ 'X-API-Key': 'wrong' })), null);
    });

    it('accepts the shared API key given as basic auth', () => {
      db.setSetting('api_key', 'legacy-key');
      const encoded = Buffer.from('anyone:legacy-key').toString('base64');

      assert.deepStrictEqual(
        auth.authenticateRequest(headers({ Authorization: `Basic ${encoded}` })),
        { kind: 'api-key' }
      );
    });

    it('no longer lets requests through merely because no API key is set', () => {
      // This is the behaviour change: before accounts existed, an unset key
      // meant an open server.
      assert.strictEqual(db.getSetting('api_key', null), null);
      assert.strictEqual(auth.authenticateRequest(headers()), null);
    });

    it('prefers a real session over the shared key, so the user is known', () => {
      db.setSetting('api_key', 'legacy-key');
      const user = auth.createFirstAdmin('admin@example.com', null);
      const issued = auth.issueSession(user, 'web');

      const result = auth.authenticateRequest(
        headers({ Authorization: `Bearer ${issued.token}`, 'X-API-Key': 'legacy-key' })
      );

      assert.strictEqual(result?.kind, 'session');
    });

    it('reports no user for an anonymous or key-only request', () => {
      db.setSetting('api_key', 'legacy-key');

      assert.strictEqual(auth.getRequestUser(headers()), null);
      assert.strictEqual(auth.getRequestUser(headers({ 'X-API-Key': 'legacy-key' })), null);
    });
  });

  describe('sign-in codes', () => {
    beforeEach(() => {
      auth.createFirstAdmin('admin@example.com', 'Admin');
    });

    /** The code only exists in the result while mail is unconfigured. */
    async function requestCode(email = 'admin@example.com', client?: 'web' | 'native') {
      const result = await auth.requestLogin({ email, client });
      return result.code!;
    }

    it('hands back a code of the advertised length, in the safe alphabet', async () => {
      const result = await auth.requestLogin({ email: 'admin@example.com' });

      assert.strictEqual(result.code!.length, result.codeLength);
      assert.match(result.code!, /^[A-Z2-9]{6}$/);
      assert.doesNotMatch(result.code!, /[IO01]/);
    });

    it('says when the code stops working', async () => {
      const result = await auth.requestLogin({ email: 'admin@example.com' });

      const remaining = Date.parse(result.expiresAt) - Date.now();
      assert.ok(remaining > 0 && remaining <= 10 * 60 * 1000, `got ${result.expiresAt}`);
    });

    it('stores only a hash, never the code itself', async () => {
      const code = await requestCode();

      const rows = db
        .getDb()
        .prepare('SELECT code_hash FROM login_codes')
        .all() as Array<{ code_hash: string }>;

      assert.strictEqual(rows.length, 1);
      assert.notStrictEqual(rows[0]!.code_hash, code);
      assert.strictEqual(rows[0]!.code_hash, auth.hashToken(code));
    });

    it('signs a browser in when the right code is typed', async () => {
      const code = await requestCode();

      const result = auth.verifyLoginCode({
        email: 'admin@example.com',
        code,
        label: 'Firefox',
      });

      assert.strictEqual(result.user.email, 'admin@example.com');
      const resolved = auth.resolveSession(result.issued.token);
      assert.strictEqual(resolved?.session.client, 'web');
      assert.strictEqual(resolved?.session.label, 'Firefox');
    });

    it('accepts a code typed in lower case, with the spacing people add', async () => {
      const code = await requestCode();

      const result = auth.verifyLoginCode({
        email: 'ADMIN@example.com',
        code: ` ${code.slice(0, 3).toLowerCase()}-${code.slice(3).toLowerCase()} `,
      });

      assert.strictEqual(result.user.email, 'admin@example.com');
    });

    it('gives a native client a native session', async () => {
      const code = await requestCode('admin@example.com', 'native');

      const result = auth.verifyLoginCode({
        email: 'admin@example.com',
        code,
        client: 'native',
        label: 'Stackarr on Android',
      });

      const resolved = auth.resolveSession(result.issued.token);
      assert.strictEqual(resolved?.session.client, 'native');
      assert.strictEqual(resolved?.session.label, 'Stackarr on Android');
    });

    it('keeps a web and a native sign-in separate, so both can be in flight', async () => {
      const webCode = await requestCode('admin@example.com', 'web');
      const nativeCode = await requestCode('admin@example.com', 'native');

      assert.ok(auth.verifyLoginCode({ email: 'admin@example.com', code: webCode }));
      assert.ok(
        auth.verifyLoginCode({
          email: 'admin@example.com',
          code: nativeCode,
          client: 'native',
        })
      );
    });

    it('refuses a code that has already been used', async () => {
      const code = await requestCode();
      auth.verifyLoginCode({ email: 'admin@example.com', code });

      assert.throws(
        () => auth.verifyLoginCode({ email: 'admin@example.com', code }),
        (error: unknown) => error instanceof auth.AuthError && error.code === 'invalid-code'
      );
    });

    it('refuses an expired code', async () => {
      const code = await requestCode();
      db.getDb().prepare("UPDATE login_codes SET expires_at = datetime('now', '-1 second')").run();

      assert.throws(
        () => auth.verifyLoginCode({ email: 'admin@example.com', code }),
        (error: unknown) => error instanceof auth.AuthError && error.code === 'invalid-code'
      );
    });

    it('refuses a code that belongs to somebody else', async () => {
      auth.createAccount('other@example.com', null);
      const code = await requestCode('admin@example.com');

      assert.throws(
        () => auth.verifyLoginCode({ email: 'other@example.com', code }),
        (error: unknown) => error instanceof auth.AuthError && error.code === 'invalid-code'
      );
    });

    it('says the same thing for a wrong code and an address with no account', async () => {
      await requestCode();

      const complain = (email: string): string => {
        try {
          auth.verifyLoginCode({ email, code: 'ZZZZZZ' });
          return 'no error';
        } catch (error) {
          return (error as Error).message;
        }
      };

      // Different wording here would let an anonymous caller work out which
      // addresses have accounts, one guess at a time.
      assert.strictEqual(complain('admin@example.com'), complain('stranger@example.com'));
      assert.notStrictEqual(complain('admin@example.com'), 'no error');
    });

    it('retires a code after too many wrong guesses', async () => {
      const code = await requestCode();

      for (let attempt = 0; attempt < 5; attempt++) {
        assert.throws(() => auth.verifyLoginCode({ email: 'admin@example.com', code: 'ZZZZZZ' }));
      }

      assert.throws(
        () => auth.verifyLoginCode({ email: 'admin@example.com', code }),
        (error: unknown) => error instanceof auth.AuthError && error.code === 'invalid-code',
        'the real code must stop working once it has been guessed at too often'
      );
    });

    it('retires the previous code when a new one is asked for', async () => {
      const first = await requestCode();

      await requestCode();

      assert.throws(() => auth.verifyLoginCode({ email: 'admin@example.com', code: first }));
    });

    it('carries the redirect through to the session it mints', async () => {
      const result = await auth.requestLogin({
        email: 'admin@example.com',
        redirectTo: '/comics/7',
      });

      const verified = auth.verifyLoginCode({
        email: 'admin@example.com',
        code: result.code!,
      });

      assert.strictEqual(verified.redirectTo, '/comics/7');
    });

    it('sends nothing to an unknown address while self-signup is off', async () => {
      const result = await auth.requestLogin({ email: 'stranger@example.com' });

      assert.strictEqual(result.emailSent, false);
      assert.strictEqual(result.code, undefined, 'no code should exist for a non-account');
      assert.strictEqual(auth.getUserByEmail('stranger@example.com'), null);
    });

    it('creates an account for an unknown address when self-signup is on', async () => {
      auth.setSignupAllowed(true);

      const result = await auth.requestLogin({ email: 'stranger@example.com' });

      assert.ok(result.code);
      const created = auth.getUserByEmail('stranger@example.com');
      assert.strictEqual(created?.role, 'user', 'a self-signup is never an admin');
    });

    it('stops sending after too many requests in a row', async () => {
      for (let attempt = 0; attempt < 5; attempt++) {
        await auth.requestLogin({ email: 'admin@example.com' });
      }

      await assert.rejects(
        () => auth.requestLogin({ email: 'admin@example.com' }),
        (error: unknown) => error instanceof auth.AuthError && error.code === 'rate-limited'
      );
    });

    it('refuses to start a login when authentication is switched off', async () => {
      process.env['SHELVARR_AUTH_ENABLED'] = 'false';

      await assert.rejects(
        () => auth.requestLogin({ email: 'admin@example.com' }),
        (error: unknown) => error instanceof auth.AuthError && error.code === 'auth-disabled'
      );
    });

    it('refuses to verify a code when authentication is switched off', async () => {
      const code = await requestCode();
      process.env['SHELVARR_AUTH_ENABLED'] = 'false';

      assert.throws(
        () => auth.verifyLoginCode({ email: 'admin@example.com', code }),
        (error: unknown) => error instanceof auth.AuthError && error.code === 'auth-disabled'
      );
    });
  });

  describe('token generation', () => {
    it('produces a different secret every time', () => {
      const tokens = new Set(Array.from({ length: 200 }, () => auth.generateToken()));
      assert.strictEqual(tokens.size, 200);
    });

    it('produces URL-safe secrets, since they travel in a query string', () => {
      for (let attempt = 0; attempt < 50; attempt++) {
        assert.match(auth.generateToken(), /^[A-Za-z0-9_-]+$/);
      }
    });

    it('leaves out characters that are easy to misread in a sign-in code', () => {
      for (let attempt = 0; attempt < 50; attempt++) {
        const code = auth.generateLoginCode();
        assert.strictEqual(code.length, auth.LOGIN_CODE_LENGTH);
        assert.doesNotMatch(code, /[IO01]/);
      }
    });

    it('tidies up a code as people actually type it', () => {
      assert.strictEqual(auth.normaliseLoginCode(' ab c-de f '), 'ABCDEF');
    });

    it('compares digests without an early exit', () => {
      const hash = auth.hashToken('abc');
      assert.strictEqual(auth.tokensMatch(hash, auth.hashToken('abc')), true);
      assert.strictEqual(auth.tokensMatch(hash, auth.hashToken('abd')), false);
      assert.strictEqual(auth.tokensMatch(hash, 'short'), false);
    });
  });

  describe('redirect safety', () => {
    it('accepts a path on this server', () => {
      assert.strictEqual(auth.isSafeRedirect('/comics/7'), true);
      assert.strictEqual(auth.isSafeRedirect('/'), true);
    });

    it('rejects anything that could leave this server', () => {
      // `//host` is the one worth remembering: it starts with a slash but is
      // a protocol-relative URL, so a naive check turns sign-in into an open
      // redirect.
      for (const value of [
        '//evil.example',
        '/\\evil.example',
        'https://evil.example',
        'comics/7',
        '',
        null,
        undefined,
      ]) {
        assert.strictEqual(auth.isSafeRedirect(value), false, `expected ${value} to be rejected`);
      }
    });
  });

  describe('cookie parsing', () => {
    it('finds a value among others', () => {
      assert.strictEqual(auth.readCookie('a=1; shelvarr_session=xyz; b=2', 'shelvarr_session'), 'xyz');
    });

    it('decodes an encoded value', () => {
      assert.strictEqual(auth.readCookie('token=a%20b', 'token'), 'a b');
    });

    it('returns null for a missing cookie or header', () => {
      assert.strictEqual(auth.readCookie('a=1', 'token'), null);
      assert.strictEqual(auth.readCookie(null, 'token'), null);
      assert.strictEqual(auth.readCookie('garbage', 'token'), null);
    });

    it('does not match a cookie whose name merely ends the same way', () => {
      assert.strictEqual(auth.readCookie('not_token=1', 'token'), null);
    });
  });

  describe('email addresses', () => {
    it('accepts ordinary addresses', () => {
      for (const value of ['a@b.co', 'first.last+tag@example.com', ' MIXED@Case.Org ']) {
        assert.strictEqual(auth.isValidEmail(value), true, `expected ${value} to be valid`);
      }
    });

    it('rejects what could never receive mail', () => {
      for (const value of ['', 'no-at-sign', 'no@tld', 'two@@example.com', 'spaces in@x.com']) {
        assert.strictEqual(auth.isValidEmail(value), false, `expected ${value} to be invalid`);
      }
    });

    it('rejects an address too long to be real', () => {
      assert.strictEqual(auth.isValidEmail(`${'a'.repeat(250)}@example.com`), false);
    });
  });
});
