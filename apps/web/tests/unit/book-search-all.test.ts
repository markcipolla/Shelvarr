/**
 * bookSearchAllHandler (task type `book_search_all`), the book equivalent of
 * comicSearchAllHandler (E4-2): the scheduled sweep that searches every still
 * -wanted book and queues a download for whatever it finds.
 *
 * `searchAllSources` is mocked here, the same way queue-handlers.test.ts
 * mocks the LibGen client — a bare module specifier, mocked before anything
 * in this file ever imports the handler that uses it.
 *
 * The `download` task this handler enqueues is mocked out too. Its own
 * behaviour (including reverting a 'searching' wanted book back to 'wanted'
 * on failure) is covered directly in queue-handlers.test.ts; here it would
 * only be a source of flakiness, since `enqueueTask` fires it in the
 * background rather than awaiting it, and it could in principle finish (and
 * touch `wanted_books.status` again) before a test gets to make its
 * assertion.
 */
import { describe, it, before, beforeEach, afterEach, after, mock } from 'node:test';
import assert from 'node:assert';
import { mkdtempSync, rmSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

interface MockDownloadResult {
  id: string;
  source: 'libgen' | 'annas' | 'zlibrary';
  title: string;
  author: string;
  extension: string;
  size: string;
  searchUrl: string;
  md5?: string;
}

/** Queued by query string; a query with no entry here comes back empty. */
let resultsByQuery: Map<string, MockDownloadResult[]>;
/** Query strings that should make the mocked search throw instead. */
let throwingQueries: Set<string>;
/** Every query string the handler actually searched for, in order. */
let searchCalls: string[];

const mockSearchAllSources = mock.fn(async (searchQuery: string) => {
  searchCalls.push(searchQuery);
  if (throwingQueries.has(searchQuery)) {
    throw new Error(`source blocked while searching "${searchQuery}"`);
  }
  return { results: resultsByQuery.get(searchQuery) ?? [], blockedSources: [] };
});

mock.module('@shelvarr/services/downloads/index', {
  namedExports: {
    searchAllSources: mockSearchAllSources,
  },
});

const mockDownloadHandler = mock.fn(async () => ({ stub: true }));

let canRunTests = true;
const checkDir = mkdtempSync(join(tmpdir(), 'shelvarr-check-'));
try {
  const Database = (await import('better-sqlite3')).default;
  const checkDb = new Database(join(checkDir, 'check.db'));
  checkDb.close();
} catch (err) {
  console.warn('⚠️  Skipping bookSearchAllHandler tests: better-sqlite3 native module not available');
  canRunTests = false;
} finally {
  rmSync(checkDir, { recursive: true, force: true });
}

if (canRunTests) {
  const testDir = mkdtempSync(join(tmpdir(), 'shelvarr-book-search-all-'));
  process.env['DATA_DIR'] = testDir;
  process.env['DB_PATH'] = join(testDir, 'test.db');

  const { initDatabase, closeDatabase, execute, queryOne } = await import('../../lib/db/index.js');
  const { createTask, runTask, getTask, registerTaskHandler } = await import('../../lib/services/queue/index.js');
  const { registerAllHandlers } = await import('../../lib/services/queue/handlers.js');

  describe('bookSearchAllHandler (book_search_all)', () => {
    before(() => {
      initDatabase();
      registerAllHandlers();
      // Overrides the real downloadHandler for every test below — see the
      // file header for why.
      registerTaskHandler('download', mockDownloadHandler);
    });

    beforeEach(() => {
      execute('DELETE FROM tasks', []);
      execute('DELETE FROM wanted_books', []);
      execute('DELETE FROM libraries', []);
      resultsByQuery = new Map();
      throwingQueries = new Set();
      searchCalls = [];
      mockSearchAllSources.mock.resetCalls();
      mockDownloadHandler.mock.resetCalls();
    });

    after(() => {
      closeDatabase();
      if (existsSync(testDir)) {
        rmSync(testDir, { recursive: true, force: true });
      }
    });

    function addBookLibrary(id = 1): void {
      execute(
        'INSERT INTO libraries (id, name, path, type) VALUES (?, ?, ?, ?)',
        [id, 'Books', `/books-${id}`, 'book']
      );
    }

    function addWantedBook(id: number, title: string, author: string, status = 'wanted'): void {
      execute(
        'INSERT INTO wanted_books (id, title, author, status) VALUES (?, ?, ?, ?)',
        [id, title, author, status]
      );
    }

    it('queues a download and moves the wanted book to "searching" when a search finds results', async () => {
      addBookLibrary();
      addWantedBook(1, 'The Fifth Season', 'N.K. Jemisin');
      resultsByQuery.set('The Fifth Season N.K. Jemisin', [
        {
          id: 'libgen-1',
          source: 'libgen',
          title: 'The Fifth Season',
          author: 'N.K. Jemisin',
          extension: 'epub',
          size: '2 MB',
          searchUrl: 'https://libgen.example/search',
          md5: 'abc123',
        },
      ]);

      const task = createTask('book_search_all', { limit: 100 });
      await runTask(task.id);

      const updated = getTask(task.id);
      assert.strictEqual(updated?.status, 'completed');
      const data = updated?.data as { searched: number; queued: number; failed: unknown[] };
      assert.strictEqual(data.searched, 1);
      assert.strictEqual(data.queued, 1);
      assert.strictEqual(data.failed.length, 0);

      const wanted = queryOne<{ status: string }>('SELECT status FROM wanted_books WHERE id = ?', [1]);
      assert.strictEqual(wanted?.status, 'searching');

      assert.strictEqual(mockDownloadHandler.mock.callCount(), 1);
    });

    it('leaves a wanted book at "wanted" when the search finds nothing', async () => {
      addBookLibrary();
      addWantedBook(1, 'An Obscure Book', 'Nobody');
      // No entry in resultsByQuery for this book's query — search "finds"
      // an empty result set, same as a real miss.

      const task = createTask('book_search_all', { limit: 100 });
      await runTask(task.id);

      const updated = getTask(task.id);
      assert.strictEqual(updated?.status, 'completed');
      const data = updated?.data as { queued: number };
      assert.strictEqual(data.queued, 0);

      const wanted = queryOne<{ status: string }>('SELECT status FROM wanted_books WHERE id = ?', [1]);
      assert.strictEqual(wanted?.status, 'wanted');
      assert.strictEqual(mockDownloadHandler.mock.callCount(), 0);
    });

    it('keeps sweeping the rest when one wanted book\'s search throws', async () => {
      addBookLibrary();
      addWantedBook(1, 'Blocked Book', 'Author One');
      addWantedBook(2, 'Findable Book', 'Author Two');

      throwingQueries.add('Blocked Book Author One');
      resultsByQuery.set('Findable Book Author Two', [
        {
          id: 'libgen-2',
          source: 'libgen',
          title: 'Findable Book',
          author: 'Author Two',
          extension: 'epub',
          size: '1 MB',
          searchUrl: 'https://libgen.example/search',
          md5: 'def456',
        },
      ]);

      const task = createTask('book_search_all', { limit: 100 });
      await runTask(task.id);

      const updated = getTask(task.id);
      assert.strictEqual(updated?.status, 'completed');
      const data = updated?.data as {
        searched: number;
        queued: number;
        failed: Array<{ wantedBookId: number; error: string }>;
      };
      assert.strictEqual(data.searched, 2);
      assert.strictEqual(data.queued, 1);
      assert.strictEqual(data.failed.length, 1);
      assert.strictEqual(data.failed[0]?.wantedBookId, 1);

      const blocked = queryOne<{ status: string }>('SELECT status FROM wanted_books WHERE id = ?', [1]);
      assert.strictEqual(blocked?.status, 'wanted');
      const findable = queryOne<{ status: string }>('SELECT status FROM wanted_books WHERE id = ?', [2]);
      assert.strictEqual(findable?.status, 'searching');
    });

    it('is a clean no-op with a reason when there is no book library', async () => {
      addWantedBook(1, 'Homeless Book', 'Someone');

      const task = createTask('book_search_all', {});
      await runTask(task.id);

      const updated = getTask(task.id);
      assert.strictEqual(updated?.status, 'completed');
      const data = updated?.data as { queued: number; searched: number; reason?: string };
      assert.strictEqual(data.queued, 0);
      assert.strictEqual(data.searched, 0);
      assert.ok(data.reason, 'expected a reason explaining the no-op');

      // Never even got to searching — there was nowhere to download to.
      assert.strictEqual(mockSearchAllSources.mock.callCount(), 0);

      const wanted = queryOne<{ status: string }>('SELECT status FROM wanted_books WHERE id = ?', [1]);
      assert.strictEqual(wanted?.status, 'wanted');
    });
  });
} else {
  describe('bookSearchAllHandler (book_search_all)', () => {
    it('skipped - native modules not available', { skip: true }, () => {});
  });
}
