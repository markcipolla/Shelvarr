/**
 * Unit tests for the /api/refresh/comics route handler.
 */

import { describe, it, beforeEach, mock } from 'node:test';
import assert from 'node:assert';

let authResult = true;
const refreshMock = mock.fn<() => Promise<unknown>>(async () => ({
  configured: true,
  refreshedVolumes: 0,
  refreshedDetails: 0,
  tombstoned: 0,
  errors: [],
}));

mock.module('@shelvarr/services', {
  namedExports: {
    validateApiAuth: () => authResult,
  },
});

mock.module('@/lib/config', { namedExports: {} });

mock.module('@/lib/refresh/comics', {
  namedExports: {
    refreshStaleComics: () => refreshMock(),
  },
});

function makeRequest(): any {
  return { headers: new Headers() };
}

const { POST } = await import('../../app/api/refresh/comics/route.js');

describe('POST /api/refresh/comics', () => {
  beforeEach(() => {
    authResult = true;
    refreshMock.mock.resetCalls();
  });

  it('returns 401 on auth failure', async () => {
    authResult = false;
    const res = await POST(makeRequest());
    assert.strictEqual(res.status, 401);
    assert.strictEqual(refreshMock.mock.callCount(), 0);
  });

  it('invokes refreshStaleComics and returns its summary', async () => {
    const payload = {
      configured: true,
      refreshedVolumes: 4,
      refreshedDetails: 2,
      tombstoned: 1,
      errors: ['x'],
    };
    refreshMock.mock.mockImplementation(async () => payload);
    const res = await POST(makeRequest());
    assert.strictEqual(res.status, 200);
    const body = await res.json();
    assert.deepStrictEqual(body, payload);
    assert.strictEqual(refreshMock.mock.callCount(), 1);
  });
});
