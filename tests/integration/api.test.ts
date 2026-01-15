import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import type { Server } from 'http';
import express, { Express } from 'express';
import apiRoutes from '../../src/routes/index.js';
import { initDatabase, closeDatabase } from '../../src/db/index.js';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

interface ApiResponse<T = unknown> {
  status: number;
  data: T;
}

describe('API Integration Tests', () => {
  let server: Server;
  let baseUrl: string;
  let tempDir: string;

  before(async () => {
    // Create temp directory for test database
    tempDir = mkdtempSync(join(tmpdir(), 'komgarr-test-'));

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
    // Close server
    if (server) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }

    // Close database
    closeDatabase();

    // Cleanup temp directory
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

  describe('GET /api/health', () => {
    it('should return health status', async () => {
      const { status, data } = await fetchApi<{ status: string; version: string; timestamp: string }>(
        '/health'
      );

      assert.strictEqual(status, 200);
      assert.strictEqual(data.status, 'ok');
      assert.strictEqual(data.version, '0.1.0');
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
    it('should return empty books list (placeholder)', async () => {
      const { status, data } = await fetchApi<{ books: unknown[]; total: number }>('/books');

      assert.strictEqual(status, 200);
      assert.ok(Array.isArray(data.books));
      assert.strictEqual(data.total, 0);
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
    it('should return empty duplicates list (placeholder)', async () => {
      const { status, data } = await fetchApi<{ duplicates: unknown[] }>('/duplicates');

      assert.strictEqual(status, 200);
      assert.ok(Array.isArray(data.duplicates));
    });
  });
});
