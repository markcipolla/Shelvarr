/**
 * Unit tests for getReadingUserId — whose shelf a request reads and writes.
 *
 * Runs against a real database and real sessions, because the answer depends
 * on how the request authenticated, and there are three legitimate ways in.
 */

import { describe, it, before, after, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { mkdirSync, rmSync } from 'fs';
import { join } from 'path';

let db: typeof import('../../lib/db/index.js');
let auth: typeof import('@shelvarr/services').auth;
let getReadingUserId: typeof import('@shelvarr/services').getReadingUserId;
let SHARED_USER_ID: number;
let root: string;

let savedAuthEnabled: string | undefined;

describe('getReadingUserId', () => {
  before(async () => {
    root = '/tmp/shelvarr-reading-user-test-' + Date.now();
    process.env['DATA_DIR'] = root;
    process.env['DB_PATH'] = join(root, 'test.db');
    mkdirSync(root, { recursive: true });

    db = await import('../../lib/db/index.js');
    db.initDatabase();

    const services = await import('@shelvarr/services');
    auth = services.auth;
    getReadingUserId = services.getReadingUserId;
    SHARED_USER_ID = services.SHARED_USER_ID;
  });

  after(() => {
    if (db) db.closeDatabase();
    rmSync(root, { recursive: true, force: true });
  });

  beforeEach(() => {
    savedAuthEnabled = process.env['SHELVARR_AUTH_ENABLED'];
    process.env['SHELVARR_AUTH_ENABLED'] = 'true';
    db.getDb().exec(
      'DELETE FROM login_tokens; DELETE FROM auth_sessions; DELETE FROM users; DELETE FROM settings;'
    );
  });

  afterEach(() => {
    if (savedAuthEnabled === undefined) delete process.env['SHELVARR_AUTH_ENABLED'];
    else process.env['SHELVARR_AUTH_ENABLED'] = savedAuthEnabled;
  });

  it('gives a signed-in person their own shelf', () => {
    const user = auth.createFirstAdmin('ada@example.com', 'Ada');
    const { token } = auth.issueSession(user, 'web');

    assert.strictEqual(
      getReadingUserId(new Headers({ Cookie: `${auth.SESSION_COOKIE_NAME}=${token}` })),
      user.id
    );
  });

  it('reads the bearer token the native app sends', () => {
    const user = auth.createFirstAdmin('ada@example.com', 'Ada');
    const { token } = auth.issueSession(user, 'native', 'Pixel');

    assert.strictEqual(
      getReadingUserId(new Headers({ Authorization: `Bearer ${token}` })),
      user.id
    );
  });

  it('keeps two people apart', () => {
    const first = auth.createFirstAdmin('ada@example.com', 'Ada');
    const second = auth.createAccount('bob@example.com', 'Bob');
    const firstToken = auth.issueSession(first, 'web').token;
    const secondToken = auth.issueSession(second, 'web').token;

    const firstId = getReadingUserId(new Headers({ Authorization: `Bearer ${firstToken}` }));
    const secondId = getReadingUserId(new Headers({ Authorization: `Bearer ${secondToken}` }));

    assert.strictEqual(firstId, first.id);
    assert.strictEqual(secondId, second.id);
    assert.notStrictEqual(firstId, secondId);
  });

  it('falls back to the shared shelf when accounts are switched off', () => {
    process.env['SHELVARR_AUTH_ENABLED'] = 'false';
    assert.strictEqual(getReadingUserId(new Headers()), SHARED_USER_ID);
  });

  it('falls back to the shared shelf for the legacy API key', () => {
    // The shared key grants access but names nobody, so there is no personal
    // shelf to pick — scripts and integrations get the shared one.
    auth.createFirstAdmin('ada@example.com', 'Ada');
    db.setSetting('api_key', 'secret-key');

    assert.strictEqual(
      getReadingUserId(new Headers({ 'X-API-Key': 'secret-key' })),
      SHARED_USER_ID
    );
  });

  it('prefers a real session over the shared key on the same request', () => {
    const user = auth.createFirstAdmin('ada@example.com', 'Ada');
    const { token } = auth.issueSession(user, 'web');
    db.setSetting('api_key', 'secret-key');

    assert.strictEqual(
      getReadingUserId(
        new Headers({ 'X-API-Key': 'secret-key', Authorization: `Bearer ${token}` })
      ),
      user.id
    );
  });

  it('gives an unauthenticated request the shared shelf, having already been refused', () => {
    // validateApiAuth turns these away before a route ever asks whose shelf it
    // is; this just pins down that the fallback is not somebody's account.
    auth.createFirstAdmin('ada@example.com', 'Ada');
    assert.strictEqual(getReadingUserId(new Headers()), SHARED_USER_ID);
  });
});
