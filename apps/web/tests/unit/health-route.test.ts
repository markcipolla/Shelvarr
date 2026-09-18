/**
 * Unit tests for GET /api/health — the endpoint a deploy waits on.
 *
 * Its contract is narrow and load-bearing in two directions: the native app
 * treats `status: "ok"` as "this is a Shelvarr server", and Docker/Swarm treat
 * a non-2xx as "do not send this container traffic". So both the shape and the
 * status code are asserted here.
 */

import { describe, it, beforeEach, mock } from 'node:test';
import assert from 'node:assert';

let probe: () => unknown = () => ({ ok: 1 });

mock.module('@/lib/db', {
  namedExports: {
    queryOne: (sql: string) => {
      assert.match(sql, /^SELECT 1/i);
      return probe();
    },
  },
});

const { GET } = await import('@/app/api/health/route');

describe('GET /api/health', () => {
  beforeEach(() => {
    probe = () => ({ ok: 1 });
  });

  it('answers 200 with a timestamp when the database is readable', async () => {
    const response = await GET();
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.status, 'ok');
    assert.equal(body.database, 'ok');
    assert.ok(!Number.isNaN(Date.parse(body.timestamp)));
  });

  it('answers 503 when the database will not answer, so a broken container is never routed to', async () => {
    probe = () => {
      throw new Error('SQLITE_CANTOPEN: unable to open database file');
    };
    const errors = mock.method(console, 'error', () => {});

    try {
      const response = await GET();
      const body = await response.json();

      assert.equal(response.status, 503);
      assert.equal(body.status, 'error');
      assert.equal(body.database, 'unavailable');
      // The reason belongs in the log, not in an unauthenticated response.
      assert.equal(JSON.stringify(body).includes('SQLITE_CANTOPEN'), false);
      assert.equal(errors.mock.callCount(), 1);
    } finally {
      errors.mock.restore();
    }
  });
});
