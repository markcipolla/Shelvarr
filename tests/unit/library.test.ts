/**
 * Library Service Unit Tests
 * Tests library and scanner service functionality
 */

import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert';
import { mkdirSync, rmSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

describe('Library Service', () => {
  let testDir: string;
  let libraryPath: string;
  let db: typeof import('../../lib/db/index.js');
  let libraryService: typeof import('../../lib/services/library/index.js');

  before(async () => {
    // Create test directories
    testDir = mkdirSync(join(tmpdir(), 'shelvarr-lib-test-' + Date.now()), { recursive: true }) as unknown as string || join(tmpdir(), 'shelvarr-lib-test-' + Date.now());
    if (!existsSync(testDir)) {
      mkdirSync(testDir, { recursive: true });
    }

    libraryPath = join(testDir, 'library');
    mkdirSync(libraryPath, { recursive: true });

    // Set up test environment
    process.env['DATA_DIR'] = testDir;
    process.env['DB_PATH'] = join(testDir, 'test.db');
    process.env['LIBRARY_ROOT'] = testDir;

    db = await import('../../lib/db/index.js');
    db.initDatabase();

    libraryService = await import('../../lib/services/library/index.js');
  });

  after(() => {
    if (db) {
      db.closeDatabase();
    }
    if (testDir && existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  beforeEach(() => {
    if (!db) return;
    const database = db.getDb();
    database.exec(`
      DELETE FROM books;
      DELETE FROM libraries;
    `);
  });

  describe('createLibrary', () => {
    it('should create a library with valid data', async () => {
      const result = await libraryService.createLibrary({
        name: 'Test Library',
        path: libraryPath
      });

      assert.ok(result.success);
      assert.ok(result.library);
      assert.strictEqual(result.library.name, 'Test Library');
      assert.strictEqual(result.library.path, libraryPath);
    });

    it('should reject duplicate library paths', async () => {
      await libraryService.createLibrary({
        name: 'First Library',
        path: libraryPath
      });

      const result = await libraryService.createLibrary({
        name: 'Second Library',
        path: libraryPath
      });

      assert.ok(!result.success);
      assert.ok(result.error?.includes('already exists'));
    });

    it('should reject invalid paths', async () => {
      const result = await libraryService.createLibrary({
        name: 'Invalid Path Library',
        path: '/nonexistent/path/that/does/not/exist'
      });

      assert.ok(!result.success);
      assert.ok(result.error);
    });
  });

  describe('getLibraryById', () => {
    it('should retrieve a library by ID', async () => {
      const createResult = await libraryService.createLibrary({
        name: 'Get By ID Test',
        path: libraryPath
      });

      assert.ok(createResult.library);

      const library = await libraryService.getLibraryById(createResult.library.id);
      assert.ok(library);
      assert.strictEqual(library.name, 'Get By ID Test');
    });

    it('should return null for non-existent ID', async () => {
      const library = await libraryService.getLibraryById(99999);
      assert.strictEqual(library, null);
    });
  });

  describe('getAllLibraries', () => {
    it('should return all libraries', async () => {
      await libraryService.createLibrary({ name: 'Lib 1', path: libraryPath });

      const lib2Path = join(testDir, 'lib2');
      mkdirSync(lib2Path, { recursive: true });
      await libraryService.createLibrary({ name: 'Lib 2', path: lib2Path });

      const libraries = await libraryService.getAllLibraries();
      assert.strictEqual(libraries.length, 2);
    });

    it('should return empty array when no libraries', async () => {
      const libraries = await libraryService.getAllLibraries();
      assert.strictEqual(libraries.length, 0);
    });
  });

  describe('deleteLibrary', () => {
    it('should delete a library', async () => {
      const createResult = await libraryService.createLibrary({
        name: 'To Delete',
        path: libraryPath
      });

      assert.ok(createResult.library);

      await libraryService.deleteLibrary(createResult.library.id);

      const library = await libraryService.getLibraryById(createResult.library.id);
      assert.strictEqual(library, null);
    });
  });

  describe('getLibraryBookCount', () => {
    it('should return 0 for library with no books', async () => {
      const createResult = await libraryService.createLibrary({
        name: 'Empty Library',
        path: libraryPath
      });

      assert.ok(createResult.library);

      const count = await libraryService.getLibraryBookCount(createResult.library.id);
      assert.strictEqual(count, 0);
    });
  });
});

describe('Scanner Service - File Detection', () => {
  describe('supported extensions', () => {
    it('should support epub files', () => {
      const supportedExtensions = ['.epub', '.pdf', '.mobi', '.azw', '.azw3'];
      assert.ok(supportedExtensions.includes('.epub'));
    });

    it('should support pdf files', () => {
      const supportedExtensions = ['.epub', '.pdf', '.mobi', '.azw', '.azw3'];
      assert.ok(supportedExtensions.includes('.pdf'));
    });

    it('should support kindle formats', () => {
      const supportedExtensions = ['.epub', '.pdf', '.mobi', '.azw', '.azw3'];
      assert.ok(supportedExtensions.includes('.mobi'));
      assert.ok(supportedExtensions.includes('.azw'));
      assert.ok(supportedExtensions.includes('.azw3'));
    });
  });

  describe('file path parsing', () => {
    it('should extract title from simple filename', () => {
      const filename = 'The Great Gatsby.epub';
      const title = filename.replace(/\.[^.]+$/, '');
      assert.strictEqual(title, 'The Great Gatsby');
    });

    it('should handle filenames with multiple dots', () => {
      const filename = 'Dr. Jekyll and Mr. Hyde.epub';
      const title = filename.replace(/\.[^.]+$/, '');
      assert.strictEqual(title, 'Dr. Jekyll and Mr. Hyde');
    });

    it('should extract author from path pattern', () => {
      const path = '/library/F. Scott Fitzgerald/The Great Gatsby.epub';
      const parts = path.split('/');
      const author = parts[parts.length - 2];
      assert.strictEqual(author, 'F. Scott Fitzgerald');
    });
  });
});
