/**
 * Unit tests for GET /up — the liveness probe a deploy waits on.
 *
 * The status code is the contract: Docker and Swarm read nothing else, and a
 * container that answers 503 is one they will not move traffic to. The body is
 * for whoever curls it by hand.
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

const { GET } = await import('@/app/up/route');

describe('GET /up', () => {
  beforeEach(() => {
    probe = () => ({ ok: 1 });
  });

  it('answers 200 ok when the database is readable', async () => {
    const response = await GET();

    assert.equal(response.status, 200);
    assert.equal(response.headers.get('content-type'), 'text/plain; charset=utf-8');
    assert.equal(await response.text(), 'ok\n');
  });

  it('answers 503 when the database will not answer, so a broken container is never routed to', async () => {
    probe = () => {
      throw new Error('SQLITE_CANTOPEN: unable to open database file');
    };
    const errors = mock.method(console, 'error', () => {});

    try {
      const response = await GET();
      const body = await response.text();

      assert.equal(response.status, 503);
      assert.equal(body, 'down\n');
      // The reason belongs in the log, not in an unauthenticated response.
      assert.equal(body.includes('SQLITE_CANTOPEN'), false);
      assert.equal(errors.mock.callCount(), 1);
    } finally {
      errors.mock.restore();
    }
  });
});
