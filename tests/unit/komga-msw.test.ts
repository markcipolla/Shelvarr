/**
 * Komga Service Tests with MSW
 * Tests using Mock Service Worker for HTTP request mocking
 */

import { describe, it, before, after, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { mkdtempSync, rmSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { server, http, HttpResponse } from '../mocks/server.js';

// Check if we can run database tests
let canRunTests = true;
const checkDir = mkdtempSync(join(tmpdir(), 'shelvarr-komga-msw-check-'));
try {
  const Database = (await import('better-sqlite3')).default;
  const checkDb = new Database(join(checkDir, 'check.db'));
  checkDb.close();
} catch (err) {
  console.warn('⚠️  Skipping Komga MSW tests: better-sqlite3 native module not available');
  canRunTests = false;
} finally {
  rmSync(checkDir, { recursive: true, force: true });
}

if (canRunTests) {
  const testDir = mkdtempSync(join(tmpdir(), 'shelvarr-komga-msw-test-'));
  process.env['DATA_DIR'] = testDir;
  process.env['DB_PATH'] = join(testDir, 'test.db');

  const { initDatabase, closeDatabase, execute, setSetting } = await import('../../lib/db/index.js');

  describe('Komga Service with MSW', () => {
    before(() => {
      server.listen({ onUnhandledRequest: 'bypass' });
    });

    after(() => {
      server.close();
      if (existsSync(testDir)) {
        rmSync(testDir, { recursive: true, force: true });
      }
    });

    beforeEach(() => {
      initDatabase();
      server.resetHandlers();
    });

    afterEach(() => {
      closeDatabase();
    });

    describe('testConnection', () => {
      it('should return success for valid connection', async () => {
        // Override handler for this specific test
        server.use(
          http.get('http://localhost:8080/api/v1/libraries', () => {
            return HttpResponse.json([
              { id: 'lib1', name: 'Test Library' }
            ]);
          })
        );

        const { komgaClient } = await import('../../lib/services/komga/index.js');
        komgaClient.configure('http://localhost:8080', 'test-api-key');

        const result = await komgaClient.testConnection();
        assert.ok(result.connected);
      });

      it('should return failure for invalid API key', async () => {
        server.use(
          http.get('http://localhost:8080/api/v1/libraries', () => {
            return new HttpResponse(null, { status: 401 });
          })
        );

        const { komgaClient } = await import('../../lib/services/komga/index.js');
        komgaClient.configure('http://localhost:8080', 'invalid-key');

        const result = await komgaClient.testConnection();
        assert.ok(!result.connected);
      });

      it('should return failure when Komga is not configured', async () => {
        const { komgaClient } = await import('../../lib/services/komga/index.js');
        komgaClient.configure(null, null);

        const result = await komgaClient.testConnection();
        assert.ok(!result.connected);
        assert.ok(result.error?.includes('not configured'));
      });

      it('should handle network errors', async () => {
        server.use(
          http.get('http://localhost:8080/api/v1/libraries', () => {
            return HttpResponse.error();
          })
        );

        const { komgaClient } = await import('../../lib/services/komga/index.js');
        komgaClient.configure('http://localhost:8080', 'test-api-key');

        const result = await komgaClient.testConnection();
        assert.ok(!result.connected);
      });
    });

    describe('getLibraries', () => {
      it('should return libraries from Komga', async () => {
        server.use(
          http.get('http://localhost:8080/api/v1/libraries', () => {
            return HttpResponse.json([
              { id: 'lib1', name: 'Comics', root: '/comics' },
              { id: 'lib2', name: 'Manga', root: '/manga' }
            ]);
          })
        );

        const { komgaClient } = await import('../../lib/services/komga/index.js');
        komgaClient.configure('http://localhost:8080', 'test-api-key');

        const result = await komgaClient.getLibraries();
        assert.strictEqual(result.length, 2);
        assert.strictEqual(result[0].name, 'Comics');
      });

      it('should return empty array when no libraries', async () => {
        server.use(
          http.get('http://localhost:8080/api/v1/libraries', () => {
            return HttpResponse.json([]);
          })
        );

        const { komgaClient } = await import('../../lib/services/komga/index.js');
        komgaClient.configure('http://localhost:8080', 'test-api-key');

        const result = await komgaClient.getLibraries();
        assert.strictEqual(result.length, 0);
      });
    });

    describe('scanLibrary', () => {
      it('should trigger library scan', async () => {
        let scanCalled = false;
        server.use(
          http.post('http://localhost:8080/api/v1/libraries/lib1/scan', () => {
            scanCalled = true;
            return new HttpResponse(null, { status: 204 });
          })
        );

        const { komgaClient } = await import('../../lib/services/komga/index.js');
        komgaClient.configure('http://localhost:8080', 'test-api-key');

        // scanLibrary returns void on success
        await komgaClient.scanLibrary('lib1');
        assert.ok(scanCalled);
      });

      it('should handle scan failure', async () => {
        server.use(
          http.post('http://localhost:8080/api/v1/libraries/lib1/scan', () => {
            return new HttpResponse(null, { status: 500 });
          })
        );

        const { komgaClient } = await import('../../lib/services/komga/index.js');
        komgaClient.configure('http://localhost:8080', 'test-api-key');

        await assert.rejects(
          async () => await komgaClient.scanLibrary('lib1'),
          /500|Internal Server Error|failed/i
        );
      });
    });

    describe('getSeries', () => {
      it('should return series from Komga', async () => {
        server.use(
          http.get('http://localhost:8080/api/v1/series', () => {
            return HttpResponse.json({
              content: [
                { id: 'series1', name: 'Test Series', booksCount: 5 },
                { id: 'series2', name: 'Another Series', booksCount: 3 }
              ],
              totalElements: 2,
              totalPages: 1
            });
          })
        );

        const { komgaClient } = await import('../../lib/services/komga/index.js');
        komgaClient.configure('http://localhost:8080', 'test-api-key');

        const result = await komgaClient.getSeries();
        assert.strictEqual(result.content.length, 2);
      });

      it('should filter series by library ID', async () => {
        let requestedUrl = '';
        server.use(
          http.get('http://localhost:8080/api/v1/series', ({ request }) => {
            requestedUrl = request.url;
            return HttpResponse.json({
              content: [{ id: 'series1', name: 'Library Series', booksCount: 2 }],
              totalElements: 1,
              totalPages: 1
            });
          })
        );

        const { komgaClient } = await import('../../lib/services/komga/index.js');
        komgaClient.configure('http://localhost:8080', 'test-api-key');

        const result = await komgaClient.getSeries({ libraryId: 'lib1' });
        assert.strictEqual(result.content.length, 1);
        assert.ok(requestedUrl.includes('library_id=lib1'));
      });
    });

    describe('getBooks', () => {
      it('should return books from Komga', async () => {
        server.use(
          http.get('http://localhost:8080/api/v1/books', () => {
            return HttpResponse.json({
              content: [
                { id: 'book1', name: 'Book One', seriesId: 'series1' },
                { id: 'book2', name: 'Book Two', seriesId: 'series1' }
              ],
              totalElements: 2,
              totalPages: 1
            });
          })
        );

        const { komgaClient } = await import('../../lib/services/komga/index.js');
        komgaClient.configure('http://localhost:8080', 'test-api-key');

        const result = await komgaClient.getBooks();
        assert.strictEqual(result.content.length, 2);
      });

      it('should filter books by series ID', async () => {
        let requestedUrl = '';
        server.use(
          http.get('http://localhost:8080/api/v1/books', ({ request }) => {
            requestedUrl = request.url;
            return HttpResponse.json({
              content: [{ id: 'book1', name: 'Series Book', seriesId: 'series1' }],
              totalElements: 1,
              totalPages: 1
            });
          })
        );

        const { komgaClient } = await import('../../lib/services/komga/index.js');
        komgaClient.configure('http://localhost:8080', 'test-api-key');

        const result = await komgaClient.getBooks({ seriesId: 'series1' });
        assert.strictEqual(result.content.length, 1);
        assert.ok(requestedUrl.includes('series_id=series1'));
      });
    });

    describe('isConfigured', () => {
      it('should return true when both URL and API key are set', async () => {
        const { komgaClient } = await import('../../lib/services/komga/index.js');
        komgaClient.configure('http://localhost:8080', 'test-api-key');

        const result = komgaClient.isConfigured();
        assert.strictEqual(result, true);
      });

      it('should return false when URL is missing', async () => {
        const { komgaClient } = await import('../../lib/services/komga/index.js');
        komgaClient.configure(null, 'test-api-key');

        const result = komgaClient.isConfigured();
        assert.strictEqual(result, false);
      });

      it('should return false when API key is missing', async () => {
        const { komgaClient } = await import('../../lib/services/komga/index.js');
        komgaClient.configure('http://localhost:8080', null);

        const result = komgaClient.isConfigured();
        assert.strictEqual(result, false);
      });
    });
  });

  console.log('✅ Komga MSW tests completed');
} else {
  describe('Komga MSW Tests', () => {
    it('skipped - native modules not available', { skip: true }, () => {});
  });
}
