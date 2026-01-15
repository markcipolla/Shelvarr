import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import type { Server } from 'http';
import express, { Express } from 'express';
import apiRoutes from '../../src/routes/index.js';
import { initDatabase, closeDatabase } from '../../src/db/index.js';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

interface ApiResponse<T = unknown> {
  status: number;
  data: T;
}

describe('Library API Integration Tests', () => {
  let server: Server;
  let baseUrl: string;
  let tempDir: string;
  let libraryPath: string;

  before(async () => {
    // Create temp directory for test database and library
    tempDir = mkdtempSync(join(tmpdir(), 'komgarr-lib-test-'));
    libraryPath = join(tempDir, 'test-library');
    mkdirSync(libraryPath);

    // Set test config
    process.env['DATA_DIR'] = tempDir;
    process.env['DB_PATH'] = join(tempDir, 'test.db');

    // Initialize database
    initDatabase();

    // Create test app
    const app: Express = express();
    app.use(express.json());
    app.use('/api', apiRoutes);

    // Start server
    await new Promise<void>((resolve) => {
      server = app.listen(0, () => {
        const addr = server.address();
        if (addr && typeof addr === 'object') {
          baseUrl = `http://localhost:${addr.port}`;
        }
        resolve();
      });
    });
  });

  after(async () => {
    if (server) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
    closeDatabase();
    if (tempDir) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  async function fetchApi<T = unknown>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<ApiResponse<T>> {
    const response = await fetch(`${baseUrl}/api${endpoint}`, {
      headers: { 'Content-Type': 'application/json', ...options.headers },
      ...options,
    });
    return {
      status: response.status,
      data: (await response.json()) as T,
    };
  }

  describe('POST /api/libraries', () => {
    it('should create a new library', async () => {
      const { status, data } = await fetchApi<{ id: number; name: string; path: string }>(
        '/libraries',
        {
          method: 'POST',
          body: JSON.stringify({ name: 'Test Library', path: libraryPath }),
        }
      );

      assert.strictEqual(status, 201);
      assert.ok(data.id);
      assert.strictEqual(data.name, 'Test Library');
      assert.strictEqual(data.path, libraryPath);
    });

    it('should return error for missing name', async () => {
      const { status, data } = await fetchApi<{ error: string }>('/libraries', {
        method: 'POST',
        body: JSON.stringify({ path: libraryPath }),
      });

      assert.strictEqual(status, 400);
      assert.ok(data.error);
    });

    it('should return error for missing path', async () => {
      const { status, data } = await fetchApi<{ error: string }>('/libraries', {
        method: 'POST',
        body: JSON.stringify({ name: 'Test' }),
      });

      assert.strictEqual(status, 400);
      assert.ok(data.error);
    });

    it('should return error for non-existent path', async () => {
      const { status, data } = await fetchApi<{ error: string }>('/libraries', {
        method: 'POST',
        body: JSON.stringify({ name: 'Test', path: '/nonexistent/path' }),
      });

      assert.strictEqual(status, 400);
      assert.ok(data.error.includes('does not exist'));
    });
  });

  describe('GET /api/libraries', () => {
    it('should list libraries', async () => {
      const { status, data } = await fetchApi<{
        libraries: Array<{ id: number; name: string; bookCount: number }>;
      }>('/libraries');

      assert.strictEqual(status, 200);
      assert.ok(Array.isArray(data.libraries));
      assert.ok(data.libraries.length >= 1);
      assert.ok('bookCount' in data.libraries[0]!);
    });
  });

  describe('GET /api/libraries/:id', () => {
    it('should get library by id', async () => {
      // Get an existing library
      const listRes = await fetchApi<{ libraries: Array<{ id: number }> }>('/libraries');
      const libId = listRes.data.libraries[0]?.id;

      const { status, data } = await fetchApi<{ id: number; name: string }>(
        `/libraries/${libId}`
      );

      assert.strictEqual(status, 200);
      assert.ok(data.id);
      assert.ok(data.name);
    });

    it('should return 404 for non-existent library', async () => {
      const { status, data } = await fetchApi<{ error: string }>('/libraries/99999');
      assert.strictEqual(status, 404);
      assert.ok(data.error);
    });
  });

  describe('POST /api/libraries/:id/scan', () => {
    it('should scan library and return results', async () => {
      // Create test files
      writeFileSync(join(libraryPath, 'test.epub'), 'content');

      // Get library id
      const listRes = await fetchApi<{ libraries: Array<{ id: number }> }>('/libraries');
      const libId = listRes.data.libraries[0]?.id;

      const { status, data } = await fetchApi<{
        success: boolean;
        added: number;
        total: number;
      }>(`/libraries/${libId}/scan`, { method: 'POST' });

      assert.strictEqual(status, 200);
      assert.ok(data.success);
      assert.ok(typeof data.added === 'number');
      assert.ok(typeof data.total === 'number');
    });
  });

  describe('GET /api/books', () => {
    it('should list books with pagination', async () => {
      const { status, data } = await fetchApi<{
        books: unknown[];
        total: number;
        page: number;
        pageSize: number;
        totalPages: number;
      }>('/books');

      assert.strictEqual(status, 200);
      assert.ok(Array.isArray(data.books));
      assert.ok(typeof data.total === 'number');
      assert.ok(typeof data.page === 'number');
      assert.ok(typeof data.pageSize === 'number');
      assert.ok(typeof data.totalPages === 'number');
    });

    it('should filter books by libraryId', async () => {
      const listRes = await fetchApi<{ libraries: Array<{ id: number }> }>('/libraries');
      const libId = listRes.data.libraries[0]?.id;

      const { status, data } = await fetchApi<{ books: unknown[]; total: number }>(
        `/books?libraryId=${libId}`
      );

      assert.strictEqual(status, 200);
      assert.ok(Array.isArray(data.books));
    });

    it('should search books', async () => {
      const { status, data } = await fetchApi<{ books: unknown[] }>('/books?search=test');

      assert.strictEqual(status, 200);
      assert.ok(Array.isArray(data.books));
    });
  });

  describe('DELETE /api/libraries/:id', () => {
    it('should delete library', async () => {
      // Create a new library to delete
      const newPath = join(tempDir, 'to-delete');
      mkdirSync(newPath);

      const createRes = await fetchApi<{ id: number }>('/libraries', {
        method: 'POST',
        body: JSON.stringify({ name: 'To Delete', path: newPath }),
      });

      const { status, data } = await fetchApi<{ success: boolean }>(
        `/libraries/${createRes.data.id}`,
        { method: 'DELETE' }
      );

      assert.strictEqual(status, 200);
      assert.strictEqual(data.success, true);

      // Verify it's gone
      const getRes = await fetchApi(`/libraries/${createRes.data.id}`);
      assert.strictEqual(getRes.status, 404);
    });
  });
});
