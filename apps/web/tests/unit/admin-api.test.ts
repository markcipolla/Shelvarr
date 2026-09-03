/**
 * The admin diagnostics API: who gets in, and what the MCP endpoint says.
 *
 * Runs against a real temporary database, because the gate reads its settings
 * out of one and the status snapshot counts real rows.
 */

import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert';
import { mkdirSync, rmSync } from 'node:fs';

let db: typeof import('../../lib/db/index.js');
let admin: typeof import('@shelvarr/services/admin/index');
let auth: typeof import('@shelvarr/services/auth/index');
let logger: typeof import('../../lib/utils/logger.js');

/** Just enough of a Headers object for the gate to read. */
function headers(values: Record<string, string> = {}): Headers {
  return new Headers(values);
}

function bearer(token: string): Headers {
  return headers({ Authorization: `Bearer ${token}` });
}

const dataDir = `/tmp/shelvarr-admin-test-${Date.now()}`;

describe('admin diagnostics API', () => {
  before(async () => {
    process.env['DATA_DIR'] = dataDir;
    process.env['DB_PATH'] = `${dataDir}/test.db`;
    // Accounts on, so the gate has something to check against.
    process.env['SHELVARR_AUTH_ENABLED'] = 'true';
    mkdirSync(dataDir, { recursive: true });

    db = await import('../../lib/db/index.js');
    db.initDatabase();

    admin = await import('@shelvarr/services/admin/index');
    auth = await import('@shelvarr/services/auth/index');
    logger = await import('../../lib/utils/logger.js');
  });

  after(() => {
    db?.closeDatabase();
    rmSync(dataDir, { recursive: true, force: true });
    delete process.env['SHELVARR_AUTH_ENABLED'];
  });

  beforeEach(() => {
    db.getDb().exec(`
      DELETE FROM settings;
      DELETE FROM tasks;
      DELETE FROM books;
      DELETE FROM libraries;
      DELETE FROM auth_sessions;
      DELETE FROM users;
      DELETE FROM sqlite_sequence WHERE name IN ('books', 'libraries');
    `);
  });

  describe('the enable switch', () => {
    it('is off until it is turned on', () => {
      assert.strictEqual(admin.isAdminApiEnabled(), false);

      const result = admin.authoriseAdminRequest(headers());
      assert.strictEqual(result.ok, false);
      assert.strictEqual(result.ok === false && result.status, 404);
    });

    it('mints a token the first time it is switched on', () => {
      assert.strictEqual(admin.getAdminApiToken(), null);

      const { enabled, token } = admin.setAdminApiEnabled(true);

      assert.strictEqual(enabled, true);
      assert.ok(token && token.length > 20);
      assert.strictEqual(admin.getAdminApiToken(), token);
    });

    it('keeps the token when switched back off, so it can be switched on again', () => {
      const { token } = admin.setAdminApiEnabled(true);
      admin.setAdminApiEnabled(false);

      assert.strictEqual(admin.isAdminApiEnabled(), false);
      assert.strictEqual(admin.getAdminApiToken(), token);

      admin.setAdminApiEnabled(true);
      assert.strictEqual(admin.getAdminApiToken(), token);
    });

    it('regenerating retires the old token', () => {
      const { token: original } = admin.setAdminApiEnabled(true);
      const replacement = admin.regenerateAdminApiToken();

      assert.notStrictEqual(replacement, original);
      assert.strictEqual(admin.authoriseAdminRequest(bearer(original!)).ok, false);
      assert.strictEqual(admin.authoriseAdminRequest(bearer(replacement)).ok, true);
    });
  });

  describe('the gate', () => {
    it('lets the admin token through', () => {
      const { token } = admin.setAdminApiEnabled(true);
      const result = admin.authoriseAdminRequest(bearer(token!));

      assert.strictEqual(result.ok, true);
      assert.strictEqual(result.ok === true && result.via, 'token');
    });

    it('turns away a wrong token', () => {
      admin.setAdminApiEnabled(true);
      const result = admin.authoriseAdminRequest(bearer('not-the-token'));

      assert.strictEqual(result.ok, false);
      assert.strictEqual(result.ok === false && result.status, 401);
    });

    it('turns away a request carrying nothing', () => {
      admin.setAdminApiEnabled(true);
      assert.strictEqual(admin.authoriseAdminRequest(headers()).ok, false);
    });

    it("lets a signed-in admin's session through", () => {
      admin.setAdminApiEnabled(true);
      const owner = auth.createFirstAdmin('admin@example.com', 'Admin');
      const session = auth.issueSession(owner, 'web', 'test');

      const result = admin.authoriseAdminRequest(bearer(session.token));

      assert.strictEqual(result.ok, true);
      assert.strictEqual(result.ok === true && result.via, 'admin-session');
    });

    it('turns away a signed-in non-admin with 403, not 401', () => {
      admin.setAdminApiEnabled(true);
      auth.createFirstAdmin('admin@example.com', 'Admin');
      const reader = auth.createAccount('reader@example.com', 'Reader', 'user');
      const session = auth.issueSession(reader, 'web', 'test');

      const result = admin.authoriseAdminRequest(bearer(session.token));

      assert.strictEqual(result.ok, false);
      assert.strictEqual(result.ok === false && result.status, 403);
    });

    it('does not accept the legacy shared API key', () => {
      admin.setAdminApiEnabled(true);
      db.setSetting('api_key', 'shared-key');

      const result = admin.authoriseAdminRequest(headers({ 'X-API-Key': 'shared-key' }));

      assert.strictEqual(result.ok, false);
      assert.strictEqual(result.ok === false && result.status, 401);
    });
  });

  describe('status', () => {
    it('reports the app, the library and the queue', () => {
      db.execute("INSERT INTO libraries (name, path) VALUES ('Books', '/books')", []);
      db.execute(
        "INSERT INTO books (library_id, file_path, title, metadata_source) VALUES (1, '/books/a.epub', 'A', 'hardcover')",
        []
      );
      db.execute(
        "INSERT INTO books (library_id, file_path, title) VALUES (1, '/books/b.epub', 'B')",
        []
      );
      db.execute("INSERT INTO tasks (type, status) VALUES ('scan', 'failed')", []);

      const status = admin.getSystemStatus();

      assert.strictEqual(status.library.libraries, 1);
      assert.strictEqual(status.library.books, 2);
      assert.strictEqual(status.library.booksWithMetadata, 1);
      assert.strictEqual(status.library.booksMissingMetadata, 1);
      assert.strictEqual(status.tasks.stats.failed, 1);
      assert.strictEqual(status.tasks.recentFailures.length, 1);
      assert.ok(status.app.uptimeSeconds >= 0);
      assert.ok(status.database.path.endsWith('test.db'));
      assert.strictEqual(status.integrations.auth.enabled, true);
    });

    it('leaves soft-deleted rows out of the counts', () => {
      db.execute("INSERT INTO libraries (name, path) VALUES ('Books', '/books')", []);
      db.execute(
        "INSERT INTO books (library_id, file_path, title, deleted_at) VALUES (1, '/books/gone.epub', 'Gone', '2026-01-01')",
        []
      );


      assert.strictEqual(admin.getSystemStatus().library.books, 0);
    });
  });

  describe('MCP endpoint', () => {
    it('answers initialize with its tools capability', () => {
      const response = admin.handleMcpMessage({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: { protocolVersion: admin.MCP_PROTOCOL_VERSION },
      });

      const result = response?.result as Record<string, any>;
      assert.strictEqual(response?.id, 1);
      assert.strictEqual(result['protocolVersion'], admin.MCP_PROTOCOL_VERSION);
      assert.ok(result['capabilities'].tools);
      assert.strictEqual(result['serverInfo'].name, admin.MCP_SERVER_NAME);
      assert.ok(typeof result['instructions'] === 'string');
    });

    it('falls back to the version it speaks when asked for one it does not', () => {
      const response = admin.handleMcpMessage({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: { protocolVersion: '1999-01-01' },
      });

      assert.strictEqual(
        (response?.result as Record<string, unknown>)['protocolVersion'],
        admin.MCP_PROTOCOL_VERSION
      );
    });

    it('says nothing at all to a notification', () => {
      assert.strictEqual(
        admin.handleMcpMessage({ jsonrpc: '2.0', method: 'notifications/initialized' }),
        null
      );
    });

    it('lists tools with schemas', () => {
      const response = admin.handleMcpMessage({ jsonrpc: '2.0', id: 2, method: 'tools/list' });
      const tools = (response?.result as { tools: Array<{ name: string; inputSchema: unknown }> })
        .tools;

      const names = tools.map((tool) => tool.name);
      assert.deepStrictEqual(names, [
        'get_status',
        'search_logs',
        'list_tasks',
        'get_task',
        'list_comic_downloads',
      ]);
      assert.ok(tools.every((tool) => tool.inputSchema));
    });

    it('runs get_status and returns it as text and structured content', () => {
      const response = admin.handleMcpMessage({
        jsonrpc: '2.0',
        id: 3,
        method: 'tools/call',
        params: { name: 'get_status', arguments: {} },
      });

      const result = response?.result as {
        content: Array<{ type: string; text: string }>;
        structuredContent: Record<string, any>;
      };

      assert.strictEqual(result.content[0].type, 'text');
      assert.ok(result.structuredContent['app'].version);
      assert.deepStrictEqual(JSON.parse(result.content[0].text), result.structuredContent);
    });

    it('runs search_logs against the live buffer', () => {
      logger.clearLogBuffer();
      const originalWarn = console.warn;
      console.warn = () => {};
      try {
        logger.createLogger('mcp-test').warn('a distinctive line');
      } finally {
        console.warn = originalWarn;
      }

      const response = admin.handleMcpMessage({
        jsonrpc: '2.0',
        id: 4,
        method: 'tools/call',
        params: { name: 'search_logs', arguments: { search: 'distinctive' } },
      });

      const structured = (response?.result as { structuredContent: Record<string, any> })
        .structuredContent;
      assert.strictEqual(structured['entries'].length, 1);
      assert.strictEqual(structured['entries'][0].message, 'a distinctive line');

      logger.clearLogBuffer();
    });

    it('reports a bad argument as a tool error, not a protocol error', () => {
      const response = admin.handleMcpMessage({
        jsonrpc: '2.0',
        id: 5,
        method: 'tools/call',
        params: { name: 'search_logs', arguments: { level: 'shouty' } },
      });

      const result = response?.result as { isError?: boolean; content: Array<{ text: string }> };
      assert.strictEqual(response?.error, undefined);
      assert.strictEqual(result.isError, true);
      assert.ok(result.content[0].text.includes('level must be one of'));
    });

    it('rejects an unknown tool', () => {
      const response = admin.handleMcpMessage({
        jsonrpc: '2.0',
        id: 6,
        method: 'tools/call',
        params: { name: 'delete_everything', arguments: {} },
      });

      assert.strictEqual(response?.error?.code, -32602);
    });

    it('rejects an unknown method', () => {
      const response = admin.handleMcpMessage({ jsonrpc: '2.0', id: 7, method: 'sing' });
      assert.strictEqual(response?.error?.code, -32601);
    });

    it('handles a batch, dropping the notifications from the reply', () => {
      const responses = admin.handleMcpBody([
        { jsonrpc: '2.0', method: 'notifications/initialized' },
        { jsonrpc: '2.0', id: 8, method: 'ping' },
      ]);

      assert.ok(Array.isArray(responses));
      assert.strictEqual(responses.length, 1);
      assert.strictEqual(responses[0].id, 8);
    });

    it('exposes only read-only tools', () => {
      const response = admin.handleMcpMessage({ jsonrpc: '2.0', id: 9, method: 'tools/list' });
      const tools = (response?.result as { tools: Array<{ name: string }> }).tools;

      const mutating = tools.filter((tool) =>
        /^(create|delete|remove|set|update|start|run|enqueue|cancel)_/.test(tool.name)
      );
      assert.deepStrictEqual(mutating, []);
    });
  });
});
