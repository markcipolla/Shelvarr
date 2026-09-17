/**
 * GET and PUT /api/reader/preferences.
 *
 * The point of this route existing at all is that reader settings are keyed
 * on a person and nothing else — no device id, no book id — which is what
 * makes them follow someone from the laptop to the tablet. Two of the tests
 * below are really assertions about that key.
 *
 * The rest guard the boundary: a row written by an older build, or by a
 * client sending whatever it likes, must come back as something the reader
 * can use rather than as an error or a broken page.
 */

import { describe, it, beforeEach, mock } from 'node:test';
import assert from 'node:assert';

let authResult = true;
let readingUserId = 5;
const stored = new Map<number, string>();
const writes: Array<{ userId: number; preferences: string }> = [];

mock.module('@shelvarr/services', {
  namedExports: {
    validateApiAuth: () => authResult,
    getReadingUserId: () => readingUserId,
  },
});

mock.module('@/lib/config', { namedExports: {} });

mock.module('@/lib/db', {
  namedExports: {
    getReaderPreferences: (userId: number) => {
      const preferences = stored.get(userId);
      return preferences
        ? { user_id: userId, preferences, created_at: '', updated_at: '' }
        : null;
    },
    setReaderPreferences: (userId: number, preferences: string) => {
      stored.set(userId, preferences);
      writes.push({ userId, preferences });
    },
  },
});

const { GET, PUT } = await import('@/app/api/reader/preferences/route');
const { DEFAULT_READER_PREFERENCES } = await import('../../lib/reader/preferences.js');

function get(): Request {
  return new Request('http://localhost/api/reader/preferences');
}

function put(body: unknown): Request {
  return new Request('http://localhost/api/reader/preferences', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('/api/reader/preferences', () => {
  beforeEach(() => {
    authResult = true;
    readingUserId = 5;
    stored.clear();
    writes.length = 0;
  });

  it('turns away a request that has not said who it is', async () => {
    authResult = false;
    assert.equal((await GET(get())).status, 401);
    assert.equal((await PUT(put({}))).status, 401);
  });

  it('hands back the defaults for someone who has never changed anything', async () => {
    const body = await (await GET(get())).json();
    assert.deepStrictEqual(body, DEFAULT_READER_PREFERENCES);
  });

  it('remembers what was saved', async () => {
    await PUT(put({ ...DEFAULT_READER_PREFERENCES, theme: 'sepia', fontSizePercent: 130 }));
    const body = await (await GET(get())).json();
    assert.strictEqual(body.theme, 'sepia');
    assert.strictEqual(body.fontSizePercent, 130);
  });

  it('keys on the person, so the same settings arrive on their other device', async () => {
    readingUserId = 5;
    await PUT(put({ ...DEFAULT_READER_PREFERENCES, theme: 'dark' }));

    // Same person, second device: the route takes no device id at all, so
    // there is nothing for a second device to differ on.
    const body = await (await GET(get())).json();
    assert.strictEqual(body.theme, 'dark');
    assert.strictEqual(writes.length, 1);
    assert.strictEqual(writes[0]!.userId, 5);
  });

  it('does not leak one person’s settings to another', async () => {
    readingUserId = 5;
    await PUT(put({ ...DEFAULT_READER_PREFERENCES, theme: 'dark' }));

    readingUserId = 6;
    const body = await (await GET(get())).json();
    assert.deepStrictEqual(body, DEFAULT_READER_PREFERENCES);
  });

  it('stores a normalised blob rather than whatever the client sent', async () => {
    await PUT(put({ theme: 'neon', fontSizePercent: 99999, sneaky: true }));
    const written = JSON.parse(writes[0]!.preferences);
    assert.strictEqual(written.theme, DEFAULT_READER_PREFERENCES.theme);
    assert.strictEqual(written.fontSizePercent, 250);
    assert.ok(!('sneaky' in written));
  });

  it('survives a row an older build wrote', async () => {
    stored.set(5, JSON.stringify({ theme: 'sepia', fontFamily: 'Comic Sans' }));
    const body = await (await GET(get())).json();
    assert.strictEqual(body.theme, 'sepia');
    assert.strictEqual(body.typeface, DEFAULT_READER_PREFERENCES.typeface);
  });

  it('survives a row that is not JSON at all', async () => {
    stored.set(5, 'not json');
    const response = await GET(get());
    assert.strictEqual(response.status, 200);
    assert.deepStrictEqual(await response.json(), DEFAULT_READER_PREFERENCES);
  });

  it('survives a body that is not JSON at all', async () => {
    const response = await PUT(
      new Request('http://localhost/api/reader/preferences', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: 'not json',
      })
    );
    assert.strictEqual(response.status, 200);
    assert.deepStrictEqual(await response.json(), DEFAULT_READER_PREFERENCES);
  });
});
