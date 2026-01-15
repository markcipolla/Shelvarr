import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { initDatabase, closeDatabase } from '../../src/db/index.js';
import { createLibrary, deleteLibrary } from '../../src/services/library/index.js';
import { scanLibrary, getBooks } from '../../src/services/scanner/index.js';

describe('Scanner Service', () => {
  let tempDir: string;
  let libraryPath: string;

  before(() => {
    // Create temp directory for test database and library
    tempDir = mkdtempSync(join(tmpdir(), 'komgarr-scanner-test-'));
    libraryPath = join(tempDir, 'test-library');
    mkdirSync(libraryPath);

    // Set test config
    process.env['DATA_DIR'] = tempDir;
    process.env['DB_PATH'] = join(tempDir, 'test.db');

    // Initialize database
    initDatabase();
  });

  after(() => {
    // Close database
    closeDatabase();

    // Cleanup temp directory
    if (tempDir) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe('scanLibrary', () => {
    it('should scan an empty library', async () => {
      const result = createLibrary({ name: 'Empty Library', path: libraryPath });
      assert.ok(result.success);
      assert.ok(result.library);

      const scanResult = await scanLibrary(result.library.id);

      assert.ok(scanResult.success);
      assert.strictEqual(scanResult.added, 0);
      assert.strictEqual(scanResult.updated, 0);
      assert.strictEqual(scanResult.removed, 0);
      assert.strictEqual(scanResult.total, 0);

      deleteLibrary(result.library.id);
    });

    it('should find and add book files', async () => {
      // Create test book files
      const booksDir = join(libraryPath, 'books');
      mkdirSync(booksDir);
      writeFileSync(join(booksDir, 'Test Book.epub'), 'fake epub content');
      writeFileSync(join(booksDir, 'Another Book.pdf'), 'fake pdf content');
      writeFileSync(join(booksDir, 'Comic.cbz'), 'fake cbz content');
      writeFileSync(join(booksDir, 'notabook.txt'), 'should be ignored');

      const result = createLibrary({ name: 'Test Library', path: libraryPath });
      assert.ok(result.success);
      assert.ok(result.library);

      const scanResult = await scanLibrary(result.library.id);

      assert.ok(scanResult.success);
      assert.strictEqual(scanResult.added, 3);
      assert.strictEqual(scanResult.total, 3);
      assert.strictEqual(scanResult.errors.length, 0);

      // Verify books were added
      const books = getBooks({ libraryId: result.library.id });
      assert.strictEqual(books.total, 3);

      // Cleanup
      deleteLibrary(result.library.id);
      rmSync(booksDir, { recursive: true, force: true });
    });

    it('should parse author from filename pattern "Author - Title"', async () => {
      const authorDir = join(libraryPath, 'author-test');
      mkdirSync(authorDir);
      writeFileSync(join(authorDir, 'Stephen King - The Shining.epub'), 'content');

      const result = createLibrary({ name: 'Author Test', path: authorDir });
      assert.ok(result.success);
      assert.ok(result.library);

      await scanLibrary(result.library.id);

      const books = getBooks({ libraryId: result.library.id });
      assert.strictEqual(books.total, 1);

      const book = books.books[0];
      assert.ok(book);
      assert.strictEqual(book.title, 'The Shining');

      const authors = JSON.parse(book.authors || '[]');
      assert.ok(authors.includes('Stephen King'));

      // Cleanup
      deleteLibrary(result.library.id);
      rmSync(authorDir, { recursive: true, force: true });
    });

    it('should update existing books on rescan', async () => {
      const rescanDir = join(libraryPath, 'rescan-test');
      mkdirSync(rescanDir);
      writeFileSync(join(rescanDir, 'Book1.epub'), 'original content');

      const result = createLibrary({ name: 'Rescan Test', path: rescanDir });
      assert.ok(result.success);
      assert.ok(result.library);

      // First scan
      const firstScan = await scanLibrary(result.library.id);
      assert.strictEqual(firstScan.added, 1);

      // Modify file and rescan
      writeFileSync(join(rescanDir, 'Book1.epub'), 'modified content longer');
      const secondScan = await scanLibrary(result.library.id);
      assert.strictEqual(secondScan.added, 0);
      assert.strictEqual(secondScan.updated, 1);

      // Cleanup
      deleteLibrary(result.library.id);
      rmSync(rescanDir, { recursive: true, force: true });
    });

    it('should remove books for deleted files', async () => {
      const removeDir = join(libraryPath, 'remove-test');
      mkdirSync(removeDir);
      writeFileSync(join(removeDir, 'Book1.epub'), 'content1');
      writeFileSync(join(removeDir, 'Book2.epub'), 'content2');

      const result = createLibrary({ name: 'Remove Test', path: removeDir });
      assert.ok(result.success);
      assert.ok(result.library);

      // First scan
      await scanLibrary(result.library.id);
      let books = getBooks({ libraryId: result.library.id });
      assert.strictEqual(books.total, 2);

      // Delete one file and rescan
      rmSync(join(removeDir, 'Book2.epub'));
      const secondScan = await scanLibrary(result.library.id);
      assert.strictEqual(secondScan.removed, 1);

      books = getBooks({ libraryId: result.library.id });
      assert.strictEqual(books.total, 1);

      // Cleanup
      deleteLibrary(result.library.id);
      rmSync(removeDir, { recursive: true, force: true });
    });

    it('should return error for non-existent library', async () => {
      const scanResult = await scanLibrary(99999);
      assert.strictEqual(scanResult.success, false);
      assert.ok(scanResult.errors.includes('Library not found'));
    });
  });

  describe('getBooks', () => {
    it('should paginate results', async () => {
      const paginateDir = join(libraryPath, 'paginate-test');
      mkdirSync(paginateDir);

      // Create 25 books
      for (let i = 1; i <= 25; i++) {
        writeFileSync(join(paginateDir, `Book ${String(i).padStart(2, '0')}.epub`), `content${i}`);
      }

      const result = createLibrary({ name: 'Paginate Test', path: paginateDir });
      assert.ok(result.success);
      assert.ok(result.library);

      await scanLibrary(result.library.id);

      // Get first page
      const page1 = getBooks({ libraryId: result.library.id, page: 1, pageSize: 10 });
      assert.strictEqual(page1.books.length, 10);
      assert.strictEqual(page1.total, 25);
      assert.strictEqual(page1.page, 1);
      assert.strictEqual(page1.totalPages, 3);

      // Get second page
      const page2 = getBooks({ libraryId: result.library.id, page: 2, pageSize: 10 });
      assert.strictEqual(page2.books.length, 10);
      assert.strictEqual(page2.page, 2);

      // Get last page
      const page3 = getBooks({ libraryId: result.library.id, page: 3, pageSize: 10 });
      assert.strictEqual(page3.books.length, 5);

      // Cleanup
      deleteLibrary(result.library.id);
      rmSync(paginateDir, { recursive: true, force: true });
    });

    it('should search by title', async () => {
      const searchDir = join(libraryPath, 'search-test');
      mkdirSync(searchDir);
      writeFileSync(join(searchDir, 'The Great Gatsby.epub'), 'content');
      writeFileSync(join(searchDir, 'To Kill a Mockingbird.epub'), 'content');
      writeFileSync(join(searchDir, 'Great Expectations.epub'), 'content');

      const result = createLibrary({ name: 'Search Test', path: searchDir });
      assert.ok(result.success);
      assert.ok(result.library);

      await scanLibrary(result.library.id);

      // Search for "Great"
      const searchResult = getBooks({ libraryId: result.library.id, search: 'Great' });
      assert.strictEqual(searchResult.total, 2);

      // Cleanup
      deleteLibrary(result.library.id);
      rmSync(searchDir, { recursive: true, force: true });
    });
  });
});
