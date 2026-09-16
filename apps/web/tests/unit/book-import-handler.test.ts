/**
 * Integration tests for the `book_import` task handler (E4-3) — the "identify,
 * then file" pipeline behind the manual "I already have this file" upload.
 *
 * Modelled on queue-handlers-full.test.ts: a real sqlite database and a real
 * organizer, with only the Hardcover network call swapped out (via
 * setHardcoverKey + the msw mocks already used by hardcover-integration.test.ts
 * and queue-handlers-full.test.ts).
 */

import { describe, it, before, beforeEach, afterEach, after } from 'node:test';
import assert from 'node:assert';
import { mkdtempSync, rmSync, existsSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { server } from '../mocks/server.js';
import { setHardcoverKey } from '../hardcover-key.js';

// Check if we can use native modules
let canRunTests = true;
const checkDir = mkdtempSync(join(tmpdir(), 'shelvarr-check-'));
try {
  const Database = (await import('better-sqlite3')).default;
  const checkDb = new Database(join(checkDir, 'check.db'));
  checkDb.close();
} catch (err) {
  console.warn('⚠️  Skipping Book Import Handler tests: better-sqlite3 native module not available');
  canRunTests = false;
} finally {
  rmSync(checkDir, { recursive: true, force: true });
}

if (canRunTests) {
  const testDir = mkdtempSync(join(tmpdir(), 'shelvarr-book-import-'));
  process.env['DATA_DIR'] = testDir;
  process.env['DB_PATH'] = join(testDir, 'test.db');

  const { initDatabase, closeDatabase, execute, queryOne } = await import('../../lib/db/index.js');
  const { createTask, runTask, getTask } = await import('../../lib/services/queue/index.js');
  const { registerAllHandlers } = await import('../../lib/services/queue/handlers.js');

  interface BookRow {
    id: number;
    title: string | null;
    authors: string | null;
    file_path: string;
    metadata_source: string | null;
  }

  describe('book_import task handler — manual import (E4-3)', () => {
    let testLibPath: string;
    let scratchDir: string;

    before(() => {
      server.listen({ onUnhandledRequest: 'bypass' });
      registerAllHandlers();
    });

    beforeEach(() => {
      initDatabase();
      server.resetHandlers();
      execute('DELETE FROM tasks', []);
      execute('DELETE FROM books', []);
      execute('DELETE FROM libraries', []);
      execute('DELETE FROM wanted_books', []);
      execute('DELETE FROM settings', []);

      testLibPath = join(testDir, 'import-lib');
      if (existsSync(testLibPath)) {
        rmSync(testLibPath, { recursive: true, force: true });
      }
      mkdirSync(testLibPath, { recursive: true });

      execute(
        'INSERT INTO libraries (id, name, path, type) VALUES (?, ?, ?, ?)',
        [1, 'Import Library', testLibPath, 'book']
      );

      scratchDir = join(testDir, 'import-scratch');
      mkdirSync(scratchDir, { recursive: true });
    });

    afterEach(() => {
      closeDatabase();
    });

    after(() => {
      server.close();
      if (existsSync(testDir)) {
        rmSync(testDir, { recursive: true, force: true });
      }
    });

    /** Write a throwaway "upload" that the handler will move out of scratch. */
    function writeScratchFile(name: string): string {
      const scratchPath = join(scratchDir, name);
      writeFileSync(scratchPath, 'fake epub contents');
      return scratchPath;
    }

    it('matches Hardcover metadata by the wanted book\'s id, files the book, and marks it acquired', async () => {
      await setHardcoverKey('test-key');

      // The shared msw handlers in tests/mocks/handlers.mjs key off an older
      // GraphQL query shape than hardcover.ts's current `books(where: ...)` /
      // `search(query: ...)` queries, so — like hardcover-integration.test.ts
      // — this stubs `global.fetch` directly rather than relying on them.
      const originalFetch = global.fetch;
      global.fetch = (async () =>
        new Response(
          JSON.stringify({
            data: {
              books: [
                {
                  id: 999,
                  title: 'Dune (Hardcover Edition)',
                  slug: 'dune',
                  cached_contributors: [{ author: { id: 1, name: 'Frank Herbert' } }],
                },
              ],
            },
          }),
          { headers: { 'content-type': 'application/json' } }
        )) as typeof fetch;

      try {
        execute(
          "INSERT INTO wanted_books (id, hardcover_id, title, author, status) VALUES (?, ?, ?, ?, ?)",
          [1, 'hc123', 'Dune', 'Frank Herbert', 'wanted']
        );

        const scratchPath = writeScratchFile('upload-1.epub');
        const task = createTask('book_import', {
          libraryId: 1,
          filePath: scratchPath,
          originalFilename: 'upload-1.epub',
          extension: 'epub',
          title: 'Dune',
          author: 'Frank Herbert',
          wantedBookId: 1,
        });

        await runTask(task.id);

        const updated = getTask(task.id);
        assert.ok(updated);
        assert.strictEqual(updated.status, 'completed');
        assert.strictEqual(updated.data?.['metadataFound'], true);
        assert.strictEqual(updated.data?.['organized'], true);

        // The scratch file is gone — moveFile relocated it into the library.
        assert.strictEqual(existsSync(scratchPath), false);

        const bookId = updated.data?.['bookId'] as number;
        const book = queryOne<BookRow>('SELECT * FROM books WHERE id = ?', [bookId]);
        assert.ok(book);
        assert.ok(existsSync(book.file_path));
        assert.strictEqual(book.metadata_source, 'hardcover');
        assert.strictEqual(book.title, 'Dune (Hardcover Edition)');

        const wanted = queryOne<{ status: string }>(
          'SELECT status FROM wanted_books WHERE id = ?',
          [1]
        );
        assert.strictEqual(wanted?.status, 'acquired');
      } finally {
        global.fetch = originalFetch;
      }
    });

    it('still imports and acquires the book when no metadata matches', async () => {
      await setHardcoverKey(null);

      execute(
        "INSERT INTO wanted_books (id, title, author, status) VALUES (?, ?, ?, ?)",
        [2, 'Some Unmatched Book', 'Some Author', 'wanted']
      );

      const scratchPath = writeScratchFile('upload-2.epub');
      const task = createTask('book_import', {
        libraryId: 1,
        filePath: scratchPath,
        originalFilename: 'upload-2.epub',
        extension: 'epub',
        title: 'Some Unmatched Book',
        author: 'Some Author',
        wantedBookId: 2,
      });

      await runTask(task.id);

      const updated = getTask(task.id);
      assert.ok(updated);
      assert.strictEqual(updated.status, 'completed');
      // No metadata source configured — the book stays unmatched rather than
      // failing the import, the same way downloadHandler leaves it.
      assert.strictEqual(updated.data?.['metadataFound'], false);

      const bookId = updated.data?.['bookId'] as number;
      const book = queryOne<BookRow>('SELECT * FROM books WHERE id = ?', [bookId]);
      assert.ok(book);
      assert.strictEqual(book.metadata_source, null);
      assert.ok(existsSync(book.file_path));

      // Acquired unconditionally on success — the file is in the library
      // either way, matched or not, so "wanted" no longer describes it.
      const wanted = queryOne<{ status: string }>(
        'SELECT status FROM wanted_books WHERE id = ?',
        [2]
      );
      assert.strictEqual(wanted?.status, 'acquired');
    });

    it('imports a file with no associated wanted book', async () => {
      await setHardcoverKey(null);

      const scratchPath = writeScratchFile('upload-3.epub');
      const task = createTask('book_import', {
        libraryId: 1,
        filePath: scratchPath,
        originalFilename: 'upload-3.epub',
        extension: 'epub',
        title: 'A Standalone Book',
        author: null,
      });

      await runTask(task.id);

      const updated = getTask(task.id);
      assert.ok(updated);
      assert.strictEqual(updated.status, 'completed');

      const bookId = updated.data?.['bookId'] as number;
      const book = queryOne<BookRow>('SELECT * FROM books WHERE id = ?', [bookId]);
      assert.ok(book);
      assert.ok(existsSync(book.file_path));
    });

    it('fails when the target library does not exist', async () => {
      const scratchPath = writeScratchFile('upload-4.epub');
      const task = createTask('book_import', {
        libraryId: 9999,
        filePath: scratchPath,
        originalFilename: 'upload-4.epub',
        extension: 'epub',
        title: 'Whatever',
        author: null,
      });

      await runTask(task.id);

      const updated = getTask(task.id);
      assert.ok(updated);
      assert.strictEqual(updated.status, 'failed');
    });
  });
} else {
  describe('book_import task handler — manual import (E4-3)', () => {
    it('skipped - native modules not available', { skip: true }, () => {});
  });
}
