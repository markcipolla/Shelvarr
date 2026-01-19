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
});
