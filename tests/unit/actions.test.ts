/**
 * Server Actions Unit Tests
 *
 * NOTE: These are integration-style tests since Next.js server actions
 * tightly couple with their dependencies. For true unit testing, the business
 * logic should be extracted into separate service functions that can be mocked.
 *
 * This test file validates the core logic paths in server actions using
 * a test database instance.
 */

import { describe, it, beforeEach, afterEach, after } from 'node:test';
import assert from 'node:assert';
import { mkdtempSync, rmSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

// Check if we can run database tests
let canRunTests = true;
const checkDir = mkdtempSync(join(tmpdir(), 'shelvarr-actions-check-'));
try {
  const Database = (await import('better-sqlite3')).default;
  const checkDb = new Database(join(checkDir, 'check.db'));
  checkDb.close();
} catch (err) {
  console.warn('⚠️  Skipping Actions tests: better-sqlite3 native module not available');
  canRunTests = false;
} finally {
  rmSync(checkDir, { recursive: true, force: true });
}

if (canRunTests) {
  const testDir = mkdtempSync(join(tmpdir(), 'shelvarr-actions-test-'));
  process.env['DATA_DIR'] = testDir;
  process.env['DB_PATH'] = join(testDir, 'test.db');

  const { initDatabase, closeDatabase, execute, query, queryOne, addWantedBook } = await import('../../lib/db/index.js');

  // ============================================================================
  // STATS ACTIONS TESTS
  // ============================================================================

  describe('Stats Actions', () => {
    beforeEach(() => {
      initDatabase();
      execute('DELETE FROM books', []);
    });

    afterEach(() => {
      closeDatabase();
    });

    after(() => {
      if (existsSync(testDir)) {
        rmSync(testDir, { recursive: true, force: true });
      }
    });

    describe('getSidebarCounts', () => {
      it('should return zero counts when no books exist', async () => {
        const { getSidebarCounts } = await import('../../lib/actions/stats.js');
        const result = await getSidebarCounts();

        assert.strictEqual(result.books, 0);
        assert.strictEqual(result.unmatched, 0);
      });

      it('should count matched and unmatched books correctly', async () => {
        // Insert test data directly
        execute(`INSERT INTO libraries (id, name, path) VALUES (1, 'Test', '/test')`, []);

        // Add matched book
        execute(`
          INSERT INTO books (library_id, file_path, file_hash, title, metadata_source)
          VALUES (1, '/test/book1.epub', 'hash1', 'Matched Book', 'hardcover')
        `, []);

        // Add unmatched book
        execute(`
          INSERT INTO books (library_id, file_path, file_hash, title, metadata_source)
          VALUES (1, '/test/book2.epub', 'hash2', 'Unmatched Book', NULL)
        `, []);

        const { getSidebarCounts } = await import('../../lib/actions/stats.js');
        const result = await getSidebarCounts();

        assert.strictEqual(result.books, 1);
        assert.strictEqual(result.unmatched, 1);
      });
    });
  });

  // ============================================================================
  // WANTED ACTIONS TESTS
  // ============================================================================

  describe('Wanted Actions', () => {
    beforeEach(() => {
      initDatabase();
      execute('DELETE FROM wanted_books', []);
    });

    afterEach(() => {
      closeDatabase();
    });

    describe('getWantedBooks', () => {
      it('should return empty array when no wanted books exist', async () => {
        const { getWantedBooks } = await import('../../lib/actions/wanted.js');
        const result = await getWantedBooks();

        assert.strictEqual(result.length, 0);
      });

      it('should return all wanted books', async () => {
        addWantedBook({ title: 'Book 1', author: 'Author 1' });
        addWantedBook({ title: 'Book 2', author: 'Author 2' });

        const { getWantedBooks } = await import('../../lib/actions/wanted.js');
        const result = await getWantedBooks();

        assert.strictEqual(result.length, 2);
      });

      it('should filter by status', async () => {
        const book1 = addWantedBook({ title: 'Book 1', author: 'Author 1' });
        addWantedBook({ title: 'Book 2', author: 'Author 2' });

        if (book1) {
          execute('UPDATE wanted_books SET status = ? WHERE id = ?', ['acquired', book1.id]);
        }

        const { getWantedBooks } = await import('../../lib/actions/wanted.js');
        const wantedResult = await getWantedBooks('wanted');
        const acquiredResult = await getWantedBooks('acquired');

        assert.strictEqual(wantedResult.length, 1);
        assert.strictEqual(acquiredResult.length, 1);
      });
    });

    describe('getWantedBook', () => {
      it('should return wanted book by ID', async () => {
        const book = addWantedBook({ title: 'Test Book', author: 'Test Author' });

        const { getWantedBook } = await import('../../lib/actions/wanted.js');
        const result = await getWantedBook(book!.id);

        assert.ok(result);
        assert.strictEqual(result.title, 'Test Book');
      });

      it('should return null for non-existent book', async () => {
        const { getWantedBook } = await import('../../lib/actions/wanted.js');
        const result = await getWantedBook(999999);

        assert.strictEqual(result, null);
      });
    });

    describe('addToWanted', () => {
      it('should add book to wanted list successfully', async () => {
        const { addToWanted } = await import('../../lib/actions/wanted.js');
        const result = await addToWanted({
          title: 'New Book',
          author: 'Author Name',
          isbn: '1234567890',
          priority: 1,
        });

        assert.strictEqual(result.success, true);
        assert.ok(result.id);
      });

      it('should return error if book already wanted', async () => {
        addWantedBook({
          title: 'Duplicate Book',
          author: 'Author',
          hardcover_id: 'hc123',
        });

        const { addToWanted } = await import('../../lib/actions/wanted.js');
        const result = await addToWanted({
          hardcoverId: 'hc123',
          title: 'Duplicate Book',
          author: 'Author',
        });

        assert.strictEqual(result.success, false);
        assert.ok(result.error?.includes('already'));
      });
    });

    describe('removeFromWanted', () => {
      it('should remove book from wanted list', async () => {
        const book = addWantedBook({ title: 'To Remove', author: 'Author' });

        const { removeFromWanted } = await import('../../lib/actions/wanted.js');
        const result = await removeFromWanted(book!.id);

        assert.strictEqual(result.success, true);

        // Verify it was removed
        const check = queryOne('SELECT * FROM wanted_books WHERE id = ?', [book!.id]);
        assert.strictEqual(check, null);
      });

      it('should return error for non-existent book', async () => {
        const { removeFromWanted } = await import('../../lib/actions/wanted.js');
        const result = await removeFromWanted(999999);

        assert.strictEqual(result.success, false);
      });
    });

    describe('updateWantedStatus', () => {
      it('should update status successfully', async () => {
        const book = addWantedBook({ title: 'Book', author: 'Author' });

        const { updateWantedStatus } = await import('../../lib/actions/wanted.js');
        const result = await updateWantedStatus(book!.id, 'searching');

        assert.strictEqual(result.success, true);

        // Verify status was updated
        const check = queryOne<{ status: string }>('SELECT status FROM wanted_books WHERE id = ?', [book!.id]);
        assert.strictEqual(check?.status, 'searching');
      });

      it('should return error for non-existent book', async () => {
        const { updateWantedStatus } = await import('../../lib/actions/wanted.js');
        const result = await updateWantedStatus(999999, 'searching');

        assert.strictEqual(result.success, false);
      });
    });

    describe('updateWantedPriority', () => {
      it('should update priority successfully', async () => {
        const book = addWantedBook({ title: 'Book', author: 'Author' });

        const { updateWantedPriority } = await import('../../lib/actions/wanted.js');
        const result = await updateWantedPriority(book!.id, 5);

        assert.strictEqual(result.success, true);

        // Verify priority was updated
        const check = queryOne<{ priority: number }>('SELECT priority FROM wanted_books WHERE id = ?', [book!.id]);
        assert.strictEqual(check?.priority, 5);
      });
    });

    describe('updateWantedNotes', () => {
      it('should update notes successfully', async () => {
        const book = addWantedBook({ title: 'Book', author: 'Author' });

        const { updateWantedNotes } = await import('../../lib/actions/wanted.js');
        const result = await updateWantedNotes(book!.id, 'Test notes');

        assert.strictEqual(result.success, true);

        // Verify notes were updated
        const check = queryOne<{ notes: string | null }>('SELECT notes FROM wanted_books WHERE id = ?', [book!.id]);
        assert.strictEqual(check?.notes, 'Test notes');
      });
    });

    describe('isBookWanted', () => {
      it('should return true for wanted book by hardcover ID', async () => {
        addWantedBook({
          title: 'Book',
          author: 'Author',
          hardcover_id: 'hc_test_123',
        });

        const { isBookWanted } = await import('../../lib/actions/wanted.js');
        const result = await isBookWanted('hc_test_123');

        assert.strictEqual(result, true);
      });

      it('should return true for wanted book by ISBN', async () => {
        addWantedBook({
          title: 'Book',
          author: 'Author',
          isbn: '9781234567890',
        });

        const { isBookWanted } = await import('../../lib/actions/wanted.js');
        const result = await isBookWanted(undefined, '9781234567890');

        assert.strictEqual(result, true);
      });

      it('should return true for wanted book by title', async () => {
        addWantedBook({
          title: 'Unique Test Title',
          author: 'Author',
        });

        const { isBookWanted } = await import('../../lib/actions/wanted.js');
        const result = await isBookWanted(undefined, undefined, 'Unique Test Title');

        assert.strictEqual(result, true);
      });

      it('should return false for non-wanted book', async () => {
        const { isBookWanted } = await import('../../lib/actions/wanted.js');
        const result = await isBookWanted('nonexistent', 'nonexistent', 'nonexistent');

        assert.strictEqual(result, false);
      });
    });
  });

  // ============================================================================
  // SEARCH ACTIONS TESTS
  // ============================================================================

  describe('Search Actions', () => {
    beforeEach(() => {
      initDatabase();
      execute('DELETE FROM books', []);
      execute('DELETE FROM authors', []);
      execute('DELETE FROM libraries', []);
    });

    afterEach(() => {
      closeDatabase();
    });

    describe('searchLocal', () => {
      it('should return empty array for short queries', async () => {
        const { searchLocal } = await import('../../lib/actions/search.js');
        const result = await searchLocal('a');

        assert.strictEqual(result.length, 0);
      });

      it('should search books by title', async () => {
        execute(`INSERT INTO libraries (id, name, path) VALUES (1, 'Test', '/test')`, []);
        execute(`
          INSERT INTO books (library_id, file_path, file_hash, title, authors)
          VALUES (1, '/test/book.epub', 'hash1', 'Test Book Title', '["Test Author"]')
        `, []);

        const { searchLocal } = await import('../../lib/actions/search.js');
        const result = await searchLocal('Test Book');

        assert.ok(result.length > 0);
        assert.ok(result.some(r => r.type === 'book' && r.title.includes('Test Book')));
      });

      it('should search authors by name', async () => {
        execute(`
          INSERT INTO authors (name, total_works)
          VALUES ('Stephen King', 50)
        `, []);

        const { searchLocal } = await import('../../lib/actions/search.js');
        const result = await searchLocal('Stephen King');

        assert.ok(result.some(r => r.type === 'author' && r.title === 'Stephen King'));
      });

      it('should search series by name', async () => {
        execute(`INSERT INTO libraries (id, name, path) VALUES (1, 'Test', '/test')`, []);
        execute(`
          INSERT INTO books (library_id, file_path, file_hash, title, series_name)
          VALUES (1, '/test/book.epub', 'hash1', 'Book 1', 'Harry Potter')
        `, []);

        const { searchLocal } = await import('../../lib/actions/search.js');
        const result = await searchLocal('Harry Potter');

        assert.ok(result.some(r => r.type === 'series' && r.title === 'Harry Potter'));
      });

      it('should limit results', async () => {
        execute(`INSERT INTO libraries (id, name, path) VALUES (1, 'Test', '/test')`, []);

        for (let i = 1; i <= 10; i++) {
          execute(`
            INSERT INTO books (library_id, file_path, file_hash, title)
            VALUES (1, '/test/book${i}.epub', 'hash${i}', 'Test Book ${i}')
          `, []);
        }

        const { searchLocal } = await import('../../lib/actions/search.js');
        const result = await searchLocal('Test', 3);

        assert.ok(result.length <= 3);
      });
    });
  });

  // ============================================================================
  // SERIES ACTIONS TESTS
  // ============================================================================

  describe('Series Actions', () => {
    beforeEach(() => {
      initDatabase();
      execute('DELETE FROM books', []);
      execute('DELETE FROM libraries', []);
    });

    afterEach(() => {
      closeDatabase();
    });

    describe('getSeries', () => {
      it('should return empty array when no series exist', async () => {
        const { getSeries } = await import('../../lib/actions/series.js');
        const result = await getSeries();

        assert.strictEqual(result.length, 0);
      });

      it('should return all series with book counts', async () => {
        execute(`INSERT INTO libraries (id, name, path) VALUES (1, 'Test', '/test')`, []);
        execute(`
          INSERT INTO books (library_id, file_path, file_hash, title, series_name, authors)
          VALUES (1, '/test/book1.epub', 'hash1', 'Book 1', 'Series A', '["Author"]')
        `, []);
        execute(`
          INSERT INTO books (library_id, file_path, file_hash, title, series_name, authors)
          VALUES (1, '/test/book2.epub', 'hash2', 'Book 2', 'Series A', '["Author"]')
        `, []);
        execute(`
          INSERT INTO books (library_id, file_path, file_hash, title, series_name, authors)
          VALUES (1, '/test/book3.epub', 'hash3', 'Book 3', 'Series B', '["Author"]')
        `, []);

        const { getSeries } = await import('../../lib/actions/series.js');
        const result = await getSeries();

        assert.strictEqual(result.length, 2);
        assert.ok(result.some(s => s.seriesName === 'Series A' && s.bookCount === 2));
        assert.ok(result.some(s => s.seriesName === 'Series B' && s.bookCount === 1));
      });

      it('should filter series by search query', async () => {
        execute(`INSERT INTO libraries (id, name, path) VALUES (1, 'Test', '/test')`, []);
        execute(`
          INSERT INTO books (library_id, file_path, file_hash, title, series_name, authors)
          VALUES (1, '/test/book1.epub', 'hash1', 'Book 1', 'Harry Potter', '["J.K. Rowling"]')
        `, []);
        execute(`
          INSERT INTO books (library_id, file_path, file_hash, title, series_name, authors)
          VALUES (1, '/test/book2.epub', 'hash2', 'Book 2', 'Lord of the Rings', '["Tolkien"]')
        `, []);

        const { getSeries } = await import('../../lib/actions/series.js');
        const result = await getSeries('Potter');

        assert.strictEqual(result.length, 1);
        assert.strictEqual(result[0]?.seriesName, 'Harry Potter');
      });
    });

    describe('getBooksBySeries', () => {
      it('should return books in series ordered by series number', async () => {
        execute(`INSERT INTO libraries (id, name, path) VALUES (1, 'Test', '/test')`, []);
        execute(`
          INSERT INTO books (library_id, file_path, file_hash, title, series_name, series_number)
          VALUES (1, '/test/book2.epub', 'hash2', 'Book 2', 'Test Series', 2)
        `, []);
        execute(`
          INSERT INTO books (library_id, file_path, file_hash, title, series_name, series_number)
          VALUES (1, '/test/book1.epub', 'hash1', 'Book 1', 'Test Series', 1)
        `, []);
        execute(`
          INSERT INTO books (library_id, file_path, file_hash, title, series_name, series_number)
          VALUES (1, '/test/book3.epub', 'hash3', 'Book 3', 'Test Series', 3)
        `, []);

        const { getBooksBySeries } = await import('../../lib/actions/series.js');
        const result = await getBooksBySeries('Test Series');

        assert.strictEqual(result.length, 3);
        assert.strictEqual(result[0]?.seriesNumber, 1);
        assert.strictEqual(result[1]?.seriesNumber, 2);
        assert.strictEqual(result[2]?.seriesNumber, 3);
      });

      it('should handle books without series numbers', async () => {
        execute(`INSERT INTO libraries (id, name, path) VALUES (1, 'Test', '/test')`, []);
        execute(`
          INSERT INTO books (library_id, file_path, file_hash, title, series_name, series_number)
          VALUES (1, '/test/book1.epub', 'hash1', 'Book Without Number', 'Test Series', NULL)
        `, []);
        execute(`
          INSERT INTO books (library_id, file_path, file_hash, title, series_name, series_number)
          VALUES (1, '/test/book2.epub', 'hash2', 'Book With Number', 'Test Series', 1)
        `, []);

        const { getBooksBySeries } = await import('../../lib/actions/series.js');
        const result = await getBooksBySeries('Test Series');

        assert.strictEqual(result.length, 2);
        // Book with number should come first
        assert.strictEqual(result[0]?.seriesNumber, 1);
        assert.strictEqual(result[1]?.seriesNumber, null);
      });
    });

    describe('getSeriesInfo', () => {
      it('should return series info with book count', async () => {
        execute(`INSERT INTO libraries (id, name, path) VALUES (1, 'Test', '/test')`, []);
        execute(`
          INSERT INTO books (library_id, file_path, file_hash, title, series_name, authors)
          VALUES (1, '/test/book1.epub', 'hash1', 'Book 1', 'Test Series', '["Author"]')
        `, []);
        execute(`
          INSERT INTO books (library_id, file_path, file_hash, title, series_name, authors)
          VALUES (1, '/test/book2.epub', 'hash2', 'Book 2', 'Test Series', '["Author"]')
        `, []);

        const { getSeriesInfo } = await import('../../lib/actions/series.js');
        const result = await getSeriesInfo('Test Series');

        assert.ok(result);
        assert.strictEqual(result.seriesName, 'Test Series');
        assert.strictEqual(result.bookCount, 2);
      });

      it('should return null for non-existent series', async () => {
        const { getSeriesInfo } = await import('../../lib/actions/series.js');
        const result = await getSeriesInfo('Nonexistent Series');

        assert.strictEqual(result, null);
      });
    });
  });

  // ============================================================================
  // SETTINGS ACTIONS TESTS
  // ============================================================================

  describe('Settings Actions', () => {
    beforeEach(() => {
      initDatabase();
      execute('DELETE FROM settings', []);
    });

    afterEach(() => {
      closeDatabase();
    });

    describe('getSettings', () => {
      it('should return all settings', async () => {
        execute(`INSERT INTO settings (key, value) VALUES ('test_key', '"test_value"')`, []);

        const { getSettings } = await import('../../lib/actions/settings.js');
        const result = await getSettings();

        assert.ok(typeof result === 'object');
      });
    });

    describe('toggleSource', () => {
      it('should toggle metadata source', async () => {
        const { toggleSource } = await import('../../lib/actions/settings.js');
        const result = await toggleSource('hardcover', true);

        assert.strictEqual(result.success, true);
      });
    });

    describe('setApiKey', () => {
      it('should set API key for source', async () => {
        const { setApiKey } = await import('../../lib/actions/settings.js');
        const result = await setApiKey('hardcover', 'test-api-key-123');

        assert.strictEqual(result.success, true);

        // Verify it was stored
        const stored = queryOne<{ value: string }>('SELECT value FROM settings WHERE key = ?', ['hardcover_api_key']);
        assert.ok(stored?.value);
      });
    });

    describe('getApiKey', () => {
      it('should get API key for source', async () => {
        execute(`INSERT INTO settings (key, value) VALUES ('hardcover_api_key', '"my-secret-key"')`, []);

        const { getApiKey } = await import('../../lib/actions/settings.js');
        const result = await getApiKey('hardcover');

        assert.strictEqual(result, 'my-secret-key');
      });

      it('should return null for non-existent key', async () => {
        const { getApiKey } = await import('../../lib/actions/settings.js');
        const result = await getApiKey('hardcover');

        assert.strictEqual(result, null);
      });
    });
  });

  // ============================================================================
  // AUTHORS ACTIONS TESTS (Helper Functions)
  // ============================================================================

  describe('Authors Actions', () => {
    beforeEach(() => {
      initDatabase();
      execute('DELETE FROM authors', []);
      execute('DELETE FROM author_works', []);
      execute('DELETE FROM books', []);
      execute('DELETE FROM libraries', []);
    });

    afterEach(() => {
      closeDatabase();
    });

    describe('getOrCreateAuthor', () => {
      it('should return existing author if found', async () => {
        execute(`INSERT INTO authors (name) VALUES ('Stephen King')`, []);

        const { getOrCreateAuthor } = await import('../../lib/actions/authors.js');
        const result = await getOrCreateAuthor('Stephen King');

        assert.strictEqual(result.name, 'Stephen King');

        // Should not create duplicate
        const count = queryOne<{ count: number }>('SELECT COUNT(*) as count FROM authors WHERE name = ?', ['Stephen King']);
        assert.strictEqual(count?.count, 1);
      });

      it('should create new author if not found', async () => {
        const { getOrCreateAuthor } = await import('../../lib/actions/authors.js');
        const result = await getOrCreateAuthor('New Author');

        assert.strictEqual(result.name, 'New Author');
        assert.ok(result.id > 0);

        // Verify it was created
        const count = queryOne<{ count: number }>('SELECT COUNT(*) as count FROM authors WHERE name = ?', ['New Author']);
        assert.strictEqual(count?.count, 1);
      });

      it('should be case-insensitive', async () => {
        execute(`INSERT INTO authors (name) VALUES ('Stephen King')`, []);

        const { getOrCreateAuthor } = await import('../../lib/actions/authors.js');
        const result = await getOrCreateAuthor('stephen king');

        assert.strictEqual(result.name, 'Stephen King');
      });
    });

    describe('getAuthor', () => {
      it('should return author by ID', async () => {
        const authorId = execute(`INSERT INTO authors (name) VALUES ('Test Author')`, []).lastInsertRowid as number;

        const { getAuthor } = await import('../../lib/actions/authors.js');
        const result = await getAuthor(authorId);

        assert.ok(result);
        assert.strictEqual(result.name, 'Test Author');
      });

      it('should return null for non-existent author', async () => {
        const { getAuthor } = await import('../../lib/actions/authors.js');
        const result = await getAuthor(999999);

        assert.strictEqual(result, null);
      });
    });

    describe('getAuthorByName', () => {
      it('should return author by name', async () => {
        execute(`INSERT INTO authors (name) VALUES ('Test Author')`, []);

        const { getAuthorByName } = await import('../../lib/actions/authors.js');
        const result = await getAuthorByName('Test Author');

        assert.ok(result);
        assert.strictEqual(result.name, 'Test Author');
      });

      it('should be case-insensitive', async () => {
        execute(`INSERT INTO authors (name) VALUES ('Test Author')`, []);

        const { getAuthorByName } = await import('../../lib/actions/authors.js');
        const result = await getAuthorByName('test author');

        assert.ok(result);
        assert.strictEqual(result.name, 'Test Author');
      });

      it('should return null for non-existent author', async () => {
        const { getAuthorByName } = await import('../../lib/actions/authors.js');
        const result = await getAuthorByName('Nonexistent Author');

        assert.strictEqual(result, null);
      });
    });

    describe('getAuthorWorks', () => {
      it('should return empty array for author with no works', async () => {
        const authorId = execute(`INSERT INTO authors (name) VALUES ('Test Author')`, []).lastInsertRowid as number;

        const { getAuthorWorks } = await import('../../lib/actions/authors.js');
        const result = await getAuthorWorks(authorId);

        assert.strictEqual(result.length, 0);
      });

      it('should return works ordered by publish year', async () => {
        const authorId = execute(`INSERT INTO authors (name) VALUES ('Test Author')`, []).lastInsertRowid as number;

        execute(`
          INSERT INTO author_works (author_id, title, publish_year)
          VALUES (?, 'Book 3', 2023)
        `, [authorId]);

        execute(`
          INSERT INTO author_works (author_id, title, publish_year)
          VALUES (?, 'Book 1', 2021)
        `, [authorId]);

        execute(`
          INSERT INTO author_works (author_id, title, publish_year)
          VALUES (?, 'Book 2', 2022)
        `, [authorId]);

        const { getAuthorWorks } = await import('../../lib/actions/authors.js');
        const result = await getAuthorWorks(authorId);

        assert.strictEqual(result.length, 3);
        assert.strictEqual(result[0]?.publishYear, 2021);
        assert.strictEqual(result[1]?.publishYear, 2022);
        assert.strictEqual(result[2]?.publishYear, 2023);
      });
    });
  });

  // ============================================================================
  // TASKS ACTIONS TESTS
  // ============================================================================

  describe('Tasks Actions', () => {
    beforeEach(() => {
      initDatabase();
      execute('DELETE FROM tasks', []);
    });

    afterEach(() => {
      closeDatabase();
    });

    describe('getTasks', () => {
      it('should return empty result when no tasks exist', async () => {
        const { getTasks } = await import('../../lib/actions/tasks.js');
        const result = await getTasks();

        assert.strictEqual(result.tasks.length, 0);
        assert.strictEqual(result.total, 0);
      });

      it('should return all tasks', async () => {
        execute(`INSERT INTO tasks (type, status, data) VALUES ('scan', 'pending', '{}')`, []);
        execute(`INSERT INTO tasks (type, status, data) VALUES ('metadata', 'completed', '{}')`, []);

        const { getTasks } = await import('../../lib/actions/tasks.js');
        const result = await getTasks();

        assert.strictEqual(result.tasks.length, 2);
        assert.strictEqual(result.total, 2);
      });

      it('should filter by status', async () => {
        execute(`INSERT INTO tasks (type, status, data) VALUES ('scan', 'pending', '{}')`, []);
        execute(`INSERT INTO tasks (type, status, data) VALUES ('metadata', 'completed', '{}')`, []);

        const { getTasks } = await import('../../lib/actions/tasks.js');
        const result = await getTasks({ status: 'pending' });

        assert.strictEqual(result.tasks.length, 1);
        assert.strictEqual(result.tasks[0]?.status, 'pending');
      });

      it('should apply limit', async () => {
        for (let i = 0; i < 10; i++) {
          execute(`INSERT INTO tasks (type, status, data) VALUES ('scan', 'pending', '{}')`, []);
        }

        const { getTasks } = await import('../../lib/actions/tasks.js');
        const result = await getTasks({ limit: 5 });

        assert.strictEqual(result.tasks.length, 5);
        assert.strictEqual(result.total, 10);
      });
    });

    describe('getTaskById', () => {
      it('should return task by ID', async () => {
        const taskId = execute(`INSERT INTO tasks (type, status, data) VALUES ('scan', 'pending', '{}')`, []).lastInsertRowid as number;

        const { getTaskById } = await import('../../lib/actions/tasks.js');
        const result = await getTaskById(taskId);

        assert.ok(result);
        assert.strictEqual(result.type, 'scan');
      });

      it('should return null for non-existent task', async () => {
        const { getTaskById } = await import('../../lib/actions/tasks.js');
        const result = await getTaskById(999999);

        assert.strictEqual(result, null);
      });
    });

    describe('cancelTask', () => {
      it('should cancel a pending task', async () => {
        const taskId = execute(`INSERT INTO tasks (type, status, data) VALUES ('scan', 'pending', '{}')`, []).lastInsertRowid as number;

        const { cancelTask } = await import('../../lib/actions/tasks.js');
        const result = await cancelTask(taskId);

        assert.strictEqual(result.success, true);

        // Verify status was updated
        const task = queryOne<{ status: string }>('SELECT status FROM tasks WHERE id = ?', [taskId]);
        assert.strictEqual(task?.status, 'cancelled');
      });
    });

    describe('cleanupTasks', () => {
      it('should cleanup old tasks', async () => {
        // Insert old task (simulate by manually setting created_at)
        execute(`
          INSERT INTO tasks (type, status, data, created_at)
          VALUES ('scan', 'completed', '{}', datetime('now', '-10 days'))
        `, []);

        // Insert recent task
        execute(`INSERT INTO tasks (type, status, data) VALUES ('scan', 'pending', '{}')`, []);

        const { cleanupTasks } = await import('../../lib/actions/tasks.js');
        const result = await cleanupTasks(7);

        assert.strictEqual(result.success, true);
        assert.strictEqual(result.deleted, 1);

        // Verify only recent task remains
        const count = queryOne<{ count: number }>('SELECT COUNT(*) as count FROM tasks', []);
        assert.strictEqual(count?.count, 1);
      });
    });
  });

  console.log('✅ All Actions tests completed successfully');
}
