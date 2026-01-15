import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import type { Server } from 'http';
import express, { Express } from 'express';
import { mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

// Set test database path before importing db module
const testDir = mkdtempSync(join(tmpdir(), 'shelvarr-test-'));
process.env['DATA_DIR'] = testDir;
process.env['DB_PATH'] = join(testDir, 'test.db');

import apiRoutes from '../../src/routes/index.js';
import { initDatabase, closeDatabase, getDb } from '../../src/db/index.js';

interface ApiResponse<T = unknown> {
  status: number;
  data: T;
}

describe('API Integration Tests', () => {
  let server: Server;
  let baseUrl: string;

  before(() => {
    // Initialize database
    initDatabase();

    // Clean up any existing test data
    const db = getDb();
    db.exec(`
      DELETE FROM downloads;
      DELETE FROM author_works;
      DELETE FROM authors;
      DELETE FROM book_series;
      DELETE FROM series;
      DELETE FROM tasks;
      DELETE FROM books;
      DELETE FROM libraries;
      DELETE FROM settings;
    `);

    // Create test app
    const app: Express = express();
    app.use(express.json());
    app.use('/api', apiRoutes);

    // Start server synchronously
    server = app.listen(0);
    const addr = server.address();
    if (addr && typeof addr === 'object') {
      baseUrl = `http://localhost:${addr.port}`;
    }
  });

  after(() => {
    // Close server
    if (server) {
      server.close();
    }

    // Close database
    closeDatabase();

    // Clean up test directory
    rmSync(testDir, { recursive: true, force: true });
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

  describe('GET /api/health', () => {
    it('should return health status', async () => {
      const { status, data } = await fetchApi<{ status: string; version: string; timestamp: string }>(
        '/health'
      );

      assert.strictEqual(status, 200);
      assert.strictEqual(data.status, 'ok');
      assert.strictEqual(data.version, '0.0.1');
      assert.ok(data.timestamp);
    });
  });

  describe('GET /api/settings', () => {
    it('should return settings with config info', async () => {
      const { status, data } = await fetchApi<{
        _config?: { supportedExtensions: string[] };
      }>('/settings');

      assert.strictEqual(status, 200);
      assert.ok(data._config);
      assert.ok(data._config.supportedExtensions);
      assert.ok(Array.isArray(data._config.supportedExtensions));
    });
  });

  describe('PUT /api/settings', () => {
    it('should update a setting', async () => {
      const { status, data } = await fetchApi<{ success: boolean; key: string; value: string }>(
        '/settings',
        {
          method: 'PUT',
          body: JSON.stringify({ key: 'testSetting', value: 'testValue' }),
        }
      );

      assert.strictEqual(status, 200);
      assert.strictEqual(data.success, true);
      assert.strictEqual(data.key, 'testSetting');
      assert.strictEqual(data.value, 'testValue');
    });

    it('should return error when key is missing', async () => {
      const { status, data } = await fetchApi<{ error?: string }>('/settings', {
        method: 'PUT',
        body: JSON.stringify({ value: 'testValue' }),
      });

      assert.strictEqual(status, 400);
      assert.ok(data.error);
    });
  });

  describe('GET /api/libraries', () => {
    it('should return empty libraries list (placeholder)', async () => {
      const { status, data } = await fetchApi<{ libraries: unknown[] }>('/libraries');

      assert.strictEqual(status, 200);
      assert.ok(Array.isArray(data.libraries));
    });
  });

  describe('GET /api/books', () => {
    it('should return books list with pagination', async () => {
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
  });

  describe('GET /api/series', () => {
    it('should return empty series list (placeholder)', async () => {
      const { status, data } = await fetchApi<{ series: unknown[] }>('/series');

      assert.strictEqual(status, 200);
      assert.ok(Array.isArray(data.series));
    });
  });

  describe('GET /api/tasks', () => {
    it('should return empty tasks list (placeholder)', async () => {
      const { status, data } = await fetchApi<{ tasks: unknown[] }>('/tasks');

      assert.strictEqual(status, 200);
      assert.ok(Array.isArray(data.tasks));
    });
  });

  describe('GET /api/authors', () => {
    it('should return empty authors list (placeholder)', async () => {
      const { status, data } = await fetchApi<{ authors: unknown[] }>('/authors');

      assert.strictEqual(status, 200);
      assert.ok(Array.isArray(data.authors));
    });
  });

  describe('GET /api/downloads', () => {
    it('should return empty downloads list (placeholder)', async () => {
      const { status, data } = await fetchApi<{ downloads: unknown[] }>('/downloads');

      assert.strictEqual(status, 200);
      assert.ok(Array.isArray(data.downloads));
    });
  });

  describe('GET /api/duplicates', () => {
    it('should return duplicates structure', async () => {
      const { status, data } = await fetchApi<{
        hashDuplicates: unknown[];
        similarityDuplicates: unknown[];
        total: number;
      }>('/duplicates');

      assert.strictEqual(status, 200);
      assert.ok(Array.isArray(data.hashDuplicates));
      assert.ok(Array.isArray(data.similarityDuplicates));
      assert.strictEqual(typeof data.total, 'number');
    });
  });
});
