/**
 * Database Operations Unit Tests
 */

import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert';

let db: typeof import('../../lib/db/index.js');

describe('Database Operations', () => {
  before(async () => {
    // Set up test environment
    process.env['DATA_DIR'] = '/tmp/shelvarr-test-' + Date.now();
    process.env['DB_PATH'] = process.env['DATA_DIR'] + '/test.db';

    const fs = await import('fs');
    fs.mkdirSync(process.env['DATA_DIR']!, { recursive: true });

    db = await import('../../lib/db/index.js');
    db.initDatabase();
  });

  after(async () => {
    if (db) {
      db.closeDatabase();
    }
    const fs = await import('fs');
    if (process.env['DATA_DIR']) {
      fs.rmSync(process.env['DATA_DIR'], { recursive: true, force: true });
    }
  });

  beforeEach(async () => {
    if (!db) return;
    // Clean up tables between tests
    const database = db.getDb();
    database.exec(`
      DELETE FROM tasks;
      DELETE FROM books;
      DELETE FROM libraries;
      DELETE FROM settings;
      DELETE FROM wanted_books;
    `);
  });

  describe('query functions', () => {
    it('should execute queries and return results', async () => {
      if (!db) return;

      const results = db.query<{ count: number }>('SELECT 1 as count', []);
      assert.strictEqual(results.length, 1);
      assert.strictEqual(results[0].count, 1);
    });

    it('should execute queryOne and return single result', async () => {
      if (!db) return;

      const result = db.queryOne<{ value: number }>('SELECT 42 as value', []);
      assert.ok(result);
      assert.strictEqual(result.value, 42);
    });

    it('should return null for queryOne with no results', async () => {
      if (!db) return;

      const result = db.queryOne<{ id: number }>(
        'SELECT id FROM libraries WHERE id = ?',
        [99999]
      );
      assert.strictEqual(result, null);
    });

    it('should execute insert and return row count', async () => {
      if (!db) return;

      const result = db.execute(
        'INSERT INTO libraries (name, path) VALUES (?, ?)',
        ['Test Library', '/test/path']
      );
      assert.strictEqual(result.rowCount, 1);
      assert.ok(result.lastInsertRowid > 0);
    });

    it('should execute insertReturning and return inserted row', async () => {
      if (!db) return;

      const result = db.insertReturning<{ id: number; name: string }>(
        'INSERT INTO libraries (name, path) VALUES (?, ?) RETURNING *',
        ['Test Library', '/test/path']
      );
      assert.ok(result);
      assert.strictEqual(result.name, 'Test Library');
      assert.ok(result.id > 0);
    });
  });

  describe('settings', () => {
    it('should set and get string settings', async () => {
      if (!db) return;

      db.setSetting('test_key', 'test_value');
      const value = db.getSetting<string>('test_key', 'default');
      assert.strictEqual(value, 'test_value');
    });

    it('should set and get object settings', async () => {
      if (!db) return;

      const obj = { foo: 'bar', num: 42 };
      db.setSetting('test_object', obj);
      const value = db.getSetting<typeof obj>('test_object', { foo: '', num: 0 });
      assert.deepStrictEqual(value, obj);
    });

    it('should return default for missing settings', async () => {
      if (!db) return;

      const value = db.getSetting<string>('nonexistent', 'default_value');
      assert.strictEqual(value, 'default_value');
    });

    it('should get all settings', async () => {
      if (!db) return;

      db.setSetting('key1', 'value1');
      db.setSetting('key2', 'value2');

      const settings = db.getAllSettings();
      assert.strictEqual(settings['key1'], 'value1');
      assert.strictEqual(settings['key2'], 'value2');
    });
  });

  describe('wanted books', () => {
    it('should add a wanted book', async () => {
      if (!db) return;

      const book = db.addWantedBook({
        title: 'Children of Time',
        author: 'Adrian Tchaikovsky',
        hardcover_id: 'hc123',
        isbn: '9781447273288',
      });

      assert.ok(book);
      assert.strictEqual(book.title, 'Children of Time');
      assert.strictEqual(book.author, 'Adrian Tchaikovsky');
      assert.strictEqual(book.status, 'wanted');
    });

    it('should get wanted books', async () => {
      if (!db) return;

      db.addWantedBook({ title: 'Book 1', author: 'Author 1' });
      db.addWantedBook({ title: 'Book 2', author: 'Author 2' });

      const books = db.getWantedBooks();
      assert.strictEqual(books.length, 2);
    });

    it('should filter wanted books by status', async () => {
      if (!db) return;

      const book1 = db.addWantedBook({ title: 'Book 1', author: 'Author 1' });
      db.addWantedBook({ title: 'Book 2', author: 'Author 2' });

      // Update status of first book
      db.updateWantedBook(book1!.id, { status: 'acquired' });

      const wantedBooks = db.getWantedBooks('wanted');
      const acquiredBooks = db.getWantedBooks('acquired');

      assert.strictEqual(wantedBooks.length, 1);
      assert.strictEqual(acquiredBooks.length, 1);
    });

    it('should update wanted book', async () => {
      if (!db) return;

      const book = db.addWantedBook({ title: 'Book 1', author: 'Author 1' });
      assert.ok(book);

      const updated = db.updateWantedBook(book.id, {
        status: 'searching',
        priority: 1,
        notes: 'Test note',
      });

      assert.ok(updated);

      const retrieved = db.getWantedBookById(book.id);
      assert.strictEqual(retrieved?.status, 'searching');
      assert.strictEqual(retrieved?.priority, 1);
      assert.strictEqual(retrieved?.notes, 'Test note');
    });

    it('should delete wanted book', async () => {
      if (!db) return;

      const book = db.addWantedBook({ title: 'Book 1', author: 'Author 1' });
      assert.ok(book);

      const deleted = db.deleteWantedBook(book.id);
      assert.ok(deleted);

      const retrieved = db.getWantedBookById(book.id);
      assert.strictEqual(retrieved, null);
    });

    describe('markWantedBookAsAcquired', () => {
      it('should mark wanted book as acquired by hardcover ID', async () => {
        if (!db) return;

        const book = db.addWantedBook({
          title: 'Children of Time',
          author: 'Adrian Tchaikovsky',
          hardcover_id: 'hc123',
        });

        assert.ok(book);
        assert.strictEqual(book.status, 'wanted');

        const acquired = db.markWantedBookAsAcquired('hc123', undefined, undefined);
        assert.ok(acquired);
        assert.strictEqual(acquired.id, book.id);
        assert.strictEqual(acquired.status, 'acquired');

        const retrieved = db.getWantedBookById(book.id);
        assert.strictEqual(retrieved?.status, 'acquired');
      });

      it('should mark wanted book as acquired by ISBN', async () => {
        if (!db) return;

        const book = db.addWantedBook({
          title: 'Children of Time',
          author: 'Adrian Tchaikovsky',
          isbn: '9781447273288',
        });

        assert.ok(book);

        const acquired = db.markWantedBookAsAcquired(undefined, '9781447273288', undefined);
        assert.ok(acquired);
        assert.strictEqual(acquired.id, book.id);
        assert.strictEqual(acquired.status, 'acquired');
      });

      it('should mark wanted book as acquired by title', async () => {
        if (!db) return;

        const book = db.addWantedBook({
          title: 'Children of Time',
          author: 'Adrian Tchaikovsky',
        });

        assert.ok(book);

        const acquired = db.markWantedBookAsAcquired(undefined, undefined, 'Children of Time');
        assert.ok(acquired);
        assert.strictEqual(acquired.id, book.id);
        assert.strictEqual(acquired.status, 'acquired');
      });

      it('should be case-insensitive for title matching', async () => {
        if (!db) return;

        const book = db.addWantedBook({
          title: 'Children of Time',
          author: 'Adrian Tchaikovsky',
        });

        assert.ok(book);

        const acquired = db.markWantedBookAsAcquired(undefined, undefined, 'children of time');
        assert.ok(acquired);
        assert.strictEqual(acquired.id, book.id);
      });

      it('should only mark books with wanted or searching status', async () => {
        if (!db) return;

        const book = db.addWantedBook({
          title: 'Test Book',
          author: 'Test Author',
          hardcover_id: 'hc456',
        });

        assert.ok(book);

        // Update to acquired
        db.updateWantedBook(book.id, { status: 'acquired' });

        // Try to mark as acquired again
        const result = db.markWantedBookAsAcquired('hc456', undefined, undefined);
        assert.strictEqual(result, null);
      });

      it('should return null when no match found', async () => {
        if (!db) return;

        const result = db.markWantedBookAsAcquired('nonexistent', undefined, undefined);
        assert.strictEqual(result, null);
      });

      it('should prioritize hardcover ID over ISBN', async () => {
        if (!db) return;

        const book1 = db.addWantedBook({
          title: 'Book 1',
          hardcover_id: 'hc123',
        });

        const book2 = db.addWantedBook({
          title: 'Book 2',
          isbn: '1234567890',
        });

        assert.ok(book1);
        assert.ok(book2);

        // Should match book1 by hardcover_id, not book2 by ISBN
        const acquired = db.markWantedBookAsAcquired('hc123', '1234567890', undefined);
        assert.ok(acquired);
        assert.strictEqual(acquired.id, book1.id);
      });

      it('should prioritize ISBN over title', async () => {
        if (!db) return;

        const book1 = db.addWantedBook({
          title: 'Test Book',
        });

        const book2 = db.addWantedBook({
          title: 'Another Book',
          isbn: '1234567890',
        });

        assert.ok(book1);
        assert.ok(book2);

        // Should match book2 by ISBN, not book1 by title
        const acquired = db.markWantedBookAsAcquired(undefined, '1234567890', 'Test Book');
        assert.ok(acquired);
        assert.strictEqual(acquired.id, book2.id);
      });
    });

    describe('isBookWanted', () => {
      it('should return true when book is wanted by hardcover ID', async () => {
        if (!db) return;

        db.addWantedBook({
          title: 'Test Book',
          hardcover_id: 'hc_test_123',
        });

        const result = db.isBookWanted('hc_test_123', undefined, undefined);
        assert.strictEqual(result, true);
      });

      it('should return true when book is wanted by ISBN', async () => {
        if (!db) return;

        db.addWantedBook({
          title: 'Test Book',
          isbn: '9781234567890',
        });

        const result = db.isBookWanted(undefined, '9781234567890', undefined);
        assert.strictEqual(result, true);
      });

      it('should return true when book is wanted by title', async () => {
        if (!db) return;

        db.addWantedBook({
          title: 'Unique Test Title',
        });

        const result = db.isBookWanted(undefined, undefined, 'Unique Test Title');
        assert.strictEqual(result, true);
      });

      it('should return false when book is not wanted', async () => {
        if (!db) return;

        const result = db.isBookWanted('nonexistent', 'nonexistent', 'nonexistent');
        assert.strictEqual(result, false);
      });

      it('should prioritize hardcover ID check', async () => {
        if (!db) return;

        db.addWantedBook({
          title: 'Test Book',
          hardcover_id: 'hc_priority',
        });

        const result = db.isBookWanted('hc_priority', 'nonexistent', 'nonexistent');
        assert.strictEqual(result, true);
      });
    });

    describe('updateWantedBook edge cases', () => {
      it('should return false when no fields to update', async () => {
        if (!db) return;

        const book = db.addWantedBook({ title: 'Test Book' });
        assert.ok(book);

        const result = db.updateWantedBook(book.id, {});
        assert.strictEqual(result, false);
      });
    });
  });

  describe('download source config', () => {
    beforeEach(async () => {
      if (!db) return;
      const database = db.getDb();
      database.exec('DELETE FROM download_source_config');
    });

    it('should get empty download source configs', async () => {
      if (!db) return;

      const configs = db.getDownloadSourceConfigs();
      assert.ok(Array.isArray(configs));
    });

    it('should upsert and get download source config', async () => {
      if (!db) return;

      db.upsertDownloadSourceConfig('test_source', true, { apiKey: 'test123' });

      const config = db.getDownloadSourceConfig('test_source');
      assert.ok(config);
      assert.strictEqual(config.source, 'test_source');
      assert.strictEqual(config.enabled, 1);
      assert.ok(config.credentials?.includes('apiKey'));
    });

    it('should update existing download source config', async () => {
      if (!db) return;

      db.upsertDownloadSourceConfig('test_source', true);
      db.upsertDownloadSourceConfig('test_source', false);

      const config = db.getDownloadSourceConfig('test_source');
      assert.ok(config);
      assert.strictEqual(config.enabled, 0);
    });

    it('should return null for nonexistent config', async () => {
      if (!db) return;

      const config = db.getDownloadSourceConfig('nonexistent');
      assert.strictEqual(config, null);
    });

    it('should check if source is enabled', async () => {
      if (!db) return;

      // Default is enabled
      assert.strictEqual(db.isSourceEnabled('unknown_source'), true);

      db.upsertDownloadSourceConfig('disabled_source', false);
      assert.strictEqual(db.isSourceEnabled('disabled_source'), false);

      db.upsertDownloadSourceConfig('enabled_source', true);
      assert.strictEqual(db.isSourceEnabled('enabled_source'), true);
    });
  });

  describe('source status cache', () => {
    beforeEach(async () => {
      if (!db) return;
      const database = db.getDb();
      database.exec('DELETE FROM source_status_cache');
    });

    it('should get empty source status cache', async () => {
      if (!db) return;

      const cache = db.getSourceStatusCache();
      assert.ok(Array.isArray(cache));
      assert.strictEqual(cache.length, 0);
    });

    it('should update and get source status', async () => {
      if (!db) return;

      db.updateSourceStatus('test_source', 'up', 150);

      const status = db.getSourceStatus('test_source');
      assert.ok(status);
      assert.strictEqual(status.source, 'test_source');
      assert.strictEqual(status.status, 'up');
      assert.strictEqual(status.response_time, 150);
    });

    it('should update existing source status', async () => {
      if (!db) return;

      db.updateSourceStatus('test_source', 'up', 100);
      db.updateSourceStatus('test_source', 'down', 500);

      const status = db.getSourceStatus('test_source');
      assert.ok(status);
      assert.strictEqual(status.status, 'down');
      assert.strictEqual(status.response_time, 500);
    });

    it('should handle status update without response time', async () => {
      if (!db) return;

      db.updateSourceStatus('test_source', 'unknown');

      const status = db.getSourceStatus('test_source');
      assert.ok(status);
      assert.strictEqual(status.status, 'unknown');
      assert.strictEqual(status.response_time, null);
    });

    it('should return null for nonexistent source status', async () => {
      if (!db) return;

      const status = db.getSourceStatus('nonexistent');
      assert.strictEqual(status, null);
    });

    it('should check if status cache is stale when empty', async () => {
      if (!db) return;

      const isStale = db.isStatusCacheStale(5);
      assert.strictEqual(isStale, true);
    });

    it('should check if status cache is fresh', async () => {
      if (!db) return;

      db.updateSourceStatus('test_source', 'up', 100);

      const isStale = db.isStatusCacheStale(5);
      assert.strictEqual(isStale, false);
    });

    it('should check if status cache is stale after timeout', async () => {
      if (!db) return;

      // Update with old timestamp by directly inserting
      const database = db.getDb();
      database.exec(`
        INSERT INTO source_status_cache (source, status, response_time, last_updated)
        VALUES ('old_source', 'up', 100, datetime('now', '-10 minutes'))
      `);

      const isStale = db.isStatusCacheStale(5);
      assert.strictEqual(isStale, true);
    });
  });

  describe('insertReturning', () => {
    it('should handle insert without RETURNING clause', async () => {
      if (!db) return;

      const result = db.insertReturning<{ id: number }>(
        'INSERT INTO libraries (name, path) VALUES (?, ?)',
        ['Test Library', '/test/path']
      );

      assert.ok(result);
      assert.ok(result.id > 0);
    });

    it('returns the conflicting row when an upsert updates instead of inserting', async () => {
      if (!db) return;

      const upsert = (name: string, path: string) =>
        db.insertReturning<{ id: number; name: string }>(
          `INSERT INTO libraries (name, path) VALUES (?, ?)
           ON CONFLICT(path) DO UPDATE SET name = excluded.name
           RETURNING id, name`,
          [name, path]
        );

      const first = upsert('First', '/upsert/one');
      const second = upsert('Second', '/upsert/two');
      assert.ok(first && second);

      // An INSERT elsewhere moves last_insert_rowid() off the libraries table,
      // which is exactly when deriving the id from it goes wrong.
      db.getDb().prepare("INSERT INTO tasks (type, status, progress) VALUES ('scan', 'pending', 0)").run();

      const again = upsert('First renamed', '/upsert/one');
      assert.ok(again);
      assert.strictEqual(again.id, first.id);
      assert.strictEqual(again.name, 'First renamed');
    });
  });
});
