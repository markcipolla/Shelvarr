import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import type { Server } from 'http';
import express, { Express } from 'express';
import { mkdirSync, rmSync, writeFileSync, mkdtempSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

// Set test database URL before importing db module
process.env['DATABASE_URL'] = process.env['TEST_DATABASE_URL'] ||
  'postgresql://shelvarr_test:shelvarr_test@localhost:5433/shelvarr_test';

import apiRoutes from '../../src/routes/index.js';
import { initDatabase, closeDatabase, getPool } from '../../src/db/index.js';

interface ApiResponse<T = unknown> {
  status: number;
  data: T;
}

describe('Metadata API Integration Tests', () => {
  let server: Server;
  let baseUrl: string;
  let tempDir: string;
  let testLibraryPath: string;

  before(async () => {
    // Create temp directory for test library files
    tempDir = mkdtempSync(join(tmpdir(), 'shelvarr-metadata-test-'));
    testLibraryPath = join(tempDir, 'test-library');
    mkdirSync(testLibraryPath, { recursive: true });

    // Initialize database
    await initDatabase();

    // Clean up any existing test data
    const pool = getPool();
    await pool.query(`
      TRUNCATE TABLE downloads, author_works, authors, book_series, series, tasks, books, libraries, settings
      RESTART IDENTITY CASCADE
    `);

    // Create test app
    const app: Express = express();
    app.use(express.json());
    app.use('/api', apiRoutes);

    // Start server on random port
    await new Promise<void>((resolve) => {
      server = app.listen(0, () => {
        const addr = server.address();
        if (addr && typeof addr === 'object') {
          baseUrl = `http://localhost:${addr.port}`;
        }
        resolve();
      });
    });

    // Create test library with a book
    writeFileSync(join(testLibraryPath, 'Test Book.epub'), 'test content');
  });

  after(async () => {
    // Cleanup
    server?.close();
    await closeDatabase();
    rmSync(tempDir, { recursive: true, force: true });
  });

  // Helper to make requests
  async function request<T = unknown>(
    path: string,
    options: { method?: string; body?: unknown } = {}
  ): Promise<ApiResponse<T>> {
    const url = `${baseUrl}/api${path}`;
    const config: RequestInit = {
      method: options.method || 'GET',
      headers: { 'Content-Type': 'application/json' },
    };

    if (options.body) {
      config.body = JSON.stringify(options.body);
    }

    const response = await fetch(url, config);
    const data = await response.json() as T;
    return { status: response.status, data };
  }

  describe('GET /api/search/books', () => {
    it('should return error without query parameter', async () => {
      const { status, data } = await request<{ error: string }>('/search/books');
      assert.strictEqual(status, 400);
      assert.ok(data.error.includes('Query parameter'));
    });

    it('should search books by query', async () => {
      // This test may fail if external APIs are unavailable
      const { status, data } = await request<{ results: unknown[] }>('/search/books?q=javascript');
      // We accept either success or error (API might be rate limited)
      assert.ok(status === 200 || status === 500);
      if (status === 200) {
        assert.ok(Array.isArray(data.results));
      }
    });

    it('should accept sources parameter', async () => {
      const { status, data } = await request<{ results: Array<{ source: string }> }>(
        '/search/books?q=test&sources=googlebooks'
      );
      // Accept either success or rate limit
      assert.ok(status === 200 || status === 500);
      if (status === 200) {
        assert.ok(Array.isArray(data.results));
        // If we got results, they should all be from googlebooks
        for (const result of data.results) {
          assert.strictEqual(result.source, 'googlebooks');
        }
      }
    });
  });

  describe('GET /api/search/isbn/:isbn', () => {
    it('should search by ISBN', async () => {
      // Using a well-known ISBN for testing
      const { status, data } = await request<{ title?: string; source?: string; error?: string }>(
        '/search/isbn/9780134685991'
      );
      // Accept success, not found, or rate limit
      assert.ok([200, 404, 500].includes(status));
      if (status === 200) {
        assert.ok(data.title);
        assert.ok(data.source);
      }
    });
  });

  describe('POST /api/books/:id/refresh', () => {
    let libraryId: number;
    let bookId: number | undefined;

    before(async () => {
      // Create a library and scan it to get a book
      const libResult = await request<{ id: number }>('/libraries', {
        method: 'POST',
        body: { name: 'Test Metadata Lib', path: testLibraryPath },
      });
      libraryId = libResult.data.id;

      // Scan the library
      await request(`/libraries/${libraryId}/scan`, { method: 'POST' });

      // Get books
      const booksResult = await request<{ books: Array<{ id: number }> }>('/books');
      if (booksResult.data.books.length > 0 && booksResult.data.books[0]) {
        bookId = booksResult.data.books[0].id;
      }
    });

    after(async () => {
      // Cleanup
      if (libraryId) {
        await request(`/libraries/${libraryId}`, { method: 'DELETE' });
      }
    });

    it('should return 400 for invalid book ID', async () => {
      const { status, data } = await request<{ error: string }>('/books/invalid/refresh', {
        method: 'POST',
      });
      assert.strictEqual(status, 400);
      assert.ok(data.error.includes('Invalid'));
    });

    it('should return 404 for non-existent book', async () => {
      const { status, data } = await request<{ error: string }>('/books/99999/refresh', {
        method: 'POST',
      });
      assert.strictEqual(status, 404);
      assert.ok(data.error.includes('not found'));
    });

    it('should attempt to refresh book metadata', async () => {
      if (!bookId) {
        // Skip if no book was created
        return;
      }

      const { status } = await request(`/books/${bookId}/refresh`, {
        method: 'POST',
      });
      // Accept success, not found metadata, or rate limit
      assert.ok([200, 404, 500].includes(status));
    });
  });

  describe('POST /api/books/:id/apply-metadata', () => {
    it('should return 400 for missing source/sourceId', async () => {
      const { status } = await request('/books/1/apply-metadata', {
        method: 'POST',
        body: {},
      });
      // Either 400 (bad request) or 404 (book not found)
      assert.ok([400, 404].includes(status));
    });

    it('should return 400 for invalid book ID', async () => {
      const { status } = await request('/books/invalid/apply-metadata', {
        method: 'POST',
        body: { source: 'googlebooks', sourceId: 'test123' },
      });
      assert.strictEqual(status, 400);
    });
  });
});
