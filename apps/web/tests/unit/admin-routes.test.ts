/**
 * The HTTP shells around the diagnostics service: that the gate is applied
 * before anything is read, and that JSON-RPC's quirks survive the round trip.
 */

import { describe, it, beforeEach, mock } from 'node:test';
import assert from 'node:assert';

type AuthResult =
  | { ok: true; via: string }
  | { ok: false; status: number; error: string };

let authResult: AuthResult = { ok: true, via: 'token' };
let lastLogQuery: Record<string, unknown> | null = null;
let lastTaskQuery: Record<string, unknown> | null = null;
let lastMcpBody: unknown = null;
let mcpResponse: unknown = { jsonrpc: '2.0', id: 1, result: {} };

mock.module('@shelvarr/services', {
  namedExports: {
    admin: {
      MCP_PROTOCOL_VERSION: '2025-06-18',
      authoriseAdminRequest: () => authResult,
      getSystemStatus: () => ({ app: { name: 'Shelvarr' } }),
      searchLogs: (options: Record<string, unknown>) => {
        lastLogQuery = options;
        return { entries: [], matched: 0 };
      },
      listTasks: (options: Record<string, unknown>) => {
        lastTaskQuery = options;
        return { tasks: [], total: 0 };
      },
      handleMcpBody: (body: unknown) => {
        lastMcpBody = body;
        return mcpResponse;
      },
      mcpParseError: () => ({ jsonrpc: '2.0', id: null, error: { code: -32700 } }),
    },
  },
});

mock.module('@/lib/config', { namedExports: {} });

/** A stand-in for NextRequest: the handlers only touch headers and the URL. */
function makeRequest(url: string, init: { headers?: Record<string, string>; body?: unknown } = {}) {
  const parsed = new URL(url);
  return {
    headers: new Headers(init.headers ?? {}),
    nextUrl: { searchParams: parsed.searchParams },
    json: async () => {
      if (init.body === undefined) throw new SyntaxError('no body');
      return init.body;
    },
  } as never;
}

describe('admin routes', () => {
  beforeEach(() => {
    authResult = { ok: true, via: 'token' };
    lastLogQuery = null;
    lastTaskQuery = null;
    lastMcpBody = null;
    mcpResponse = { jsonrpc: '2.0', id: 1, result: {} };
  });

  describe('/api/admin/status', () => {
    it('passes the gate refusal straight through, code and all', async () => {
      authResult = { ok: false, status: 404, error: 'switched off' };
      const { GET } = await import('../../app/api/admin/status/route.js');

      const response = await GET(makeRequest('http://localhost/api/admin/status'));

      assert.strictEqual(response.status, 404);
      assert.deepStrictEqual(await response.json(), { error: 'switched off' });
    });

    it('returns the status snapshot once past the gate', async () => {
      const { GET } = await import('../../app/api/admin/status/route.js');

      const response = await GET(makeRequest('http://localhost/api/admin/status'));

      assert.strictEqual(response.status, 200);
      assert.deepStrictEqual(await response.json(), { app: { name: 'Shelvarr' } });
    });
  });

  describe('/api/admin/logs', () => {
    it('turns query parameters into a log query', async () => {
      const { GET } = await import('../../app/api/admin/logs/route.js');

      await GET(
        makeRequest(
          'http://localhost/api/admin/logs?level=warn&context=scheduler&search=boom&limit=5&afterSequence=12'
        )
      );

      assert.deepStrictEqual(lastLogQuery, {
        minLevel: 'warn',
        context: 'scheduler',
        search: 'boom',
        afterSequence: 12,
        limit: 5,
      });
    });

    it('leaves absent parameters out rather than passing undefined', async () => {
      const { GET } = await import('../../app/api/admin/logs/route.js');

      await GET(makeRequest('http://localhost/api/admin/logs'));

      assert.deepStrictEqual(lastLogQuery, {});
    });

    it('rejects a level that is not one', async () => {
      const { GET } = await import('../../app/api/admin/logs/route.js');

      const response = await GET(makeRequest('http://localhost/api/admin/logs?level=shouty'));

      assert.strictEqual(response.status, 400);
      assert.strictEqual(lastLogQuery, null);
    });

    it('checks the gate before reading anything', async () => {
      authResult = { ok: false, status: 401, error: 'Unauthorized' };
      const { GET } = await import('../../app/api/admin/logs/route.js');

      const response = await GET(makeRequest('http://localhost/api/admin/logs'));

      assert.strictEqual(response.status, 401);
      assert.strictEqual(lastLogQuery, null);
    });
  });

  describe('/api/admin/tasks', () => {
    it('passes status and type through', async () => {
      const { GET } = await import('../../app/api/admin/tasks/route.js');

      await GET(makeRequest('http://localhost/api/admin/tasks?status=failed&type=comic_scan'));

      assert.deepStrictEqual(lastTaskQuery, { status: 'failed', type: 'comic_scan' });
    });

    it('rejects a status that is not one', async () => {
      const { GET } = await import('../../app/api/admin/tasks/route.js');

      const response = await GET(makeRequest('http://localhost/api/admin/tasks?status=maybe'));

      assert.strictEqual(response.status, 400);
      assert.strictEqual(lastTaskQuery, null);
    });

    it('ignores a limit that is not a number', async () => {
      const { GET } = await import('../../app/api/admin/tasks/route.js');

      await GET(makeRequest('http://localhost/api/admin/tasks?limit=lots'));

      assert.deepStrictEqual(lastTaskQuery, {});
    });
  });

  describe('/api/mcp', () => {
    it('refuses before parsing the body when the API is off', async () => {
      authResult = { ok: false, status: 404, error: 'switched off' };
      const { POST } = await import('../../app/api/mcp/route.js');

      const response = await POST(
        makeRequest('http://localhost/api/mcp', { body: { method: 'tools/list' } })
      );

      assert.strictEqual(response.status, 404);
      assert.strictEqual(lastMcpBody, null);
    });

    it('answers a request with the protocol version header', async () => {
      const { POST } = await import('../../app/api/mcp/route.js');

      const response = await POST(
        makeRequest('http://localhost/api/mcp', { body: { jsonrpc: '2.0', id: 1, method: 'ping' } })
      );

      assert.strictEqual(response.status, 200);
      assert.strictEqual(response.headers.get('MCP-Protocol-Version'), '2025-06-18');
      assert.deepStrictEqual(lastMcpBody, { jsonrpc: '2.0', id: 1, method: 'ping' });
    });

    it('answers a notification with an empty 202', async () => {
      mcpResponse = null;
      const { POST } = await import('../../app/api/mcp/route.js');

      const response = await POST(
        makeRequest('http://localhost/api/mcp', {
          body: { jsonrpc: '2.0', method: 'notifications/initialized' },
        })
      );

      assert.strictEqual(response.status, 202);
      assert.strictEqual(await response.text(), '');
    });

    it('answers a body that is not JSON with a JSON-RPC parse error', async () => {
      const { POST } = await import('../../app/api/mcp/route.js');

      const response = await POST(makeRequest('http://localhost/api/mcp'));

      assert.strictEqual(response.status, 400);
      assert.strictEqual((await response.json()).error.code, -32700);
    });

    it('has no event stream to offer a GET', async () => {
      const { GET } = await import('../../app/api/mcp/route.js');

      assert.strictEqual((await GET()).status, 405);
    });
  });
});
