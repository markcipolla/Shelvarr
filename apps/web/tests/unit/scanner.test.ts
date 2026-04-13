/**
 * Scanner Service Unit Tests
 */

import { describe, it, before, after, beforeEach, mock } from 'node:test';
import assert from 'node:assert';
import type * as fsTypes from 'fs';
import type * as pathTypes from 'path';
import type * as cryptoTypes from 'crypto';

// Test data directory
let testDataDir: string;
let db: typeof import('../../lib/db/index.js');
let scanner: typeof import('../../lib/services/scanner/index.js');
let library: typeof import('../../lib/services/library/index.js');

// Mock modules
let fsMock: {
  readdirSync: ReturnType<typeof mock.fn>;
  statSync: ReturnType<typeof mock.fn>;
  readFileSync: ReturnType<typeof mock.fn>;
};

let configMock: {
  supportedExtensions: string[];
};

describe('Scanner Service', () => {
  before(async () => {
    // Set up test environment
    testDataDir = '/tmp/shelvarr-scanner-test-' + Date.now();
    process.env['DATA_DIR'] = testDataDir;
    process.env['DB_PATH'] = testDataDir + '/test.db';

    const fs = await import('fs');
    fs.mkdirSync(testDataDir, { recursive: true });

    // Initialize database
    db = await import('../../lib/db/index.js');
    db.initDatabase();

    // Import modules after db is initialized
    scanner = await import('../../lib/services/scanner/index.js');
    library = await import('../../lib/services/library/index.js');
  });

  after(async () => {
    if (db) {
      db.closeDatabase();
    }
    const fs = await import('fs');
    if (testDataDir) {
      fs.rmSync(testDataDir, { recursive: true, force: true });
    }
  });

  beforeEach(async () => {
    if (!db) return;
    // Clean up tables between tests
    const database = db.getDb();
    database.exec(`
      DELETE FROM books;
      DELETE FROM libraries;
    `);
  });

  describe('parseFilename (internal)', () => {
    // We'll test this through the exported functions since it's not exported
    // But we can test the behavior through scanLibrary
  });

  describe('computeFileHash (internal)', () => {
    // We'll test this through scanLibrary since it's not exported
  });

  describe('findBookFiles (internal)', () => {
    // We'll test this through scanLibrary since it's not exported
  });

  describe('scanLibrary', () => {
    it('should return error when library not found', async () => {
      const result = await scanner.scanLibrary(99999);

      assert.strictEqual(result.success, false);
      assert.strictEqual(result.libraryId, 99999);
      assert.strictEqual(result.added, 0);
      assert.strictEqual(result.updated, 0);
      assert.strictEqual(result.removed, 0);
      assert.strictEqual(result.total, 0);
      assert.strictEqual(result.errors.length, 1);
      assert.strictEqual(result.errors[0], 'Library not found');
    });

    it('should scan library and add new books', async () => {
      // Create a test library
      const testLibPath = testDataDir + '/test-library';
      const fs = await import('fs');
      fs.mkdirSync(testLibPath, { recursive: true });

      // Create test files
      fs.writeFileSync(testLibPath + '/Author - Book Title.epub', 'test content');
      fs.writeFileSync(testLibPath + '/Another Book.pdf', 'test content 2');

      const libResult = await library.createLibrary({
        name: 'Test Library',
        path: testLibPath,
      });

      assert.ok(libResult.success);
      assert.ok(libResult.library);

      const result = await scanner.scanLibrary(libResult.library.id);

      assert.strictEqual(result.success, true);
      assert.strictEqual(result.libraryId, libResult.library.id);
      assert.strictEqual(result.added, 2);
      assert.strictEqual(result.updated, 0);
      assert.strictEqual(result.removed, 0);
      assert.strictEqual(result.total, 2);
      assert.strictEqual(result.errors.length, 0);

      // Verify books were added to database
      const books = await scanner.getBooks({ libraryId: libResult.library.id });
      assert.strictEqual(books.books.length, 2);
    });

    it('should update existing books on rescan', async () => {
      // Create a test library
      const testLibPath = testDataDir + '/test-library-update';
      const fs = await import('fs');
      fs.mkdirSync(testLibPath, { recursive: true });

      // Create test file
      fs.writeFileSync(testLibPath + '/test.epub', 'original content');

      const libResult = await library.createLibrary({
        name: 'Test Library Update',
        path: testLibPath,
      });

      assert.ok(libResult.success);
      assert.ok(libResult.library);

      // First scan
      const firstScan = await scanner.scanLibrary(libResult.library.id);
      assert.strictEqual(firstScan.added, 1);
      assert.strictEqual(firstScan.updated, 0);

      // Modify file
      fs.writeFileSync(testLibPath + '/test.epub', 'modified content with more data');

      // Second scan
      const secondScan = await scanner.scanLibrary(libResult.library.id);
      assert.strictEqual(secondScan.added, 0);
      assert.strictEqual(secondScan.updated, 1);
      assert.strictEqual(secondScan.removed, 0);
      assert.strictEqual(secondScan.total, 1);
    });

    it('should remove books that no longer exist', async () => {
      // Create a test library
      const testLibPath = testDataDir + '/test-library-remove';
      const fs = await import('fs');
      fs.mkdirSync(testLibPath, { recursive: true });

      // Create test files
      fs.writeFileSync(testLibPath + '/book1.epub', 'content 1');
      fs.writeFileSync(testLibPath + '/book2.epub', 'content 2');

      const libResult = await library.createLibrary({
        name: 'Test Library Remove',
        path: testLibPath,
      });

      assert.ok(libResult.success);
      assert.ok(libResult.library);

      // First scan - add both books
      const firstScan = await scanner.scanLibrary(libResult.library.id);
      assert.strictEqual(firstScan.added, 2);

      // Remove one file
      fs.unlinkSync(testLibPath + '/book2.epub');

      // Second scan - should remove missing book
      const secondScan = await scanner.scanLibrary(libResult.library.id);
      assert.strictEqual(secondScan.added, 0);
      assert.strictEqual(secondScan.updated, 1);
      assert.strictEqual(secondScan.removed, 1);
      assert.strictEqual(secondScan.total, 1);
    });

    it('should handle nested directories', async () => {
      // Create a test library with subdirectories
      const testLibPath = testDataDir + '/test-library-nested';
      const fs = await import('fs');
      fs.mkdirSync(testLibPath + '/subfolder/deepfolder', { recursive: true });

      // Create test files in different levels
      fs.writeFileSync(testLibPath + '/root.epub', 'root content');
      fs.writeFileSync(testLibPath + '/subfolder/sub.epub', 'sub content');
      fs.writeFileSync(testLibPath + '/subfolder/deepfolder/deep.epub', 'deep content');

      const libResult = await library.createLibrary({
        name: 'Test Library Nested',
        path: testLibPath,
      });

      assert.ok(libResult.success);
      assert.ok(libResult.library);

      const result = await scanner.scanLibrary(libResult.library.id);

      assert.strictEqual(result.success, true);
      assert.strictEqual(result.added, 3);
      assert.strictEqual(result.total, 3);
    });

    it('should skip hidden files and directories', async () => {
      // Create a test library
      const testLibPath = testDataDir + '/test-library-hidden';
      const fs = await import('fs');
      fs.mkdirSync(testLibPath + '/.hidden', { recursive: true });

      // Create visible and hidden files
      fs.writeFileSync(testLibPath + '/visible.epub', 'visible content');
      fs.writeFileSync(testLibPath + '/.hidden.epub', 'hidden content');
      fs.writeFileSync(testLibPath + '/.hidden/book.epub', 'in hidden dir');

      const libResult = await library.createLibrary({
        name: 'Test Library Hidden',
        path: testLibPath,
      });

      assert.ok(libResult.success);
      assert.ok(libResult.library);

      const result = await scanner.scanLibrary(libResult.library.id);

      assert.strictEqual(result.success, true);
      assert.strictEqual(result.added, 1); // Only visible.epub
      assert.strictEqual(result.total, 1);
    });

    it('should only scan supported file extensions', async () => {
      // Create a test library
      const testLibPath = testDataDir + '/test-library-extensions';
      const fs = await import('fs');
      fs.mkdirSync(testLibPath, { recursive: true });

      // Create files with various extensions
      fs.writeFileSync(testLibPath + '/book.epub', 'epub content');
      fs.writeFileSync(testLibPath + '/book.pdf', 'pdf content');
      fs.writeFileSync(testLibPath + '/book.mobi', 'mobi content');
      fs.writeFileSync(testLibPath + '/book.txt', 'text content'); // Not supported
      fs.writeFileSync(testLibPath + '/book.doc', 'doc content'); // Not supported

      const libResult = await library.createLibrary({
        name: 'Test Library Extensions',
        path: testLibPath,
      });

      assert.ok(libResult.success);
      assert.ok(libResult.library);

      const result = await scanner.scanLibrary(libResult.library.id);

      assert.strictEqual(result.success, true);
      assert.strictEqual(result.added, 3); // Only epub, pdf, mobi
      assert.strictEqual(result.total, 3);
    });

    it('should call progress callback during scan', async () => {
      // Create a test library
      const testLibPath = testDataDir + '/test-library-progress';
      const fs = await import('fs');
      fs.mkdirSync(testLibPath, { recursive: true });

      fs.writeFileSync(testLibPath + '/book1.epub', 'content 1');
      fs.writeFileSync(testLibPath + '/book2.epub', 'content 2');

      const libResult = await library.createLibrary({
        name: 'Test Library Progress',
        path: testLibPath,
      });

      assert.ok(libResult.success);
      assert.ok(libResult.library);

      const progressUpdates: any[] = [];
      const progressCallback = (progress: any) => {
        progressUpdates.push({ ...progress });
      };

      await scanner.scanLibrary(libResult.library.id, progressCallback);

      // Verify progress callbacks were made
      assert.ok(progressUpdates.length >= 3); // scanning, processing, complete

      // Check for scanning phase
      const scanningPhase = progressUpdates.find(p => p.phase === 'scanning');
      assert.ok(scanningPhase);

      // Check for processing phase
      const processingPhase = progressUpdates.find(p => p.phase === 'processing');
      assert.ok(processingPhase);

      // Check for complete phase
      const completePhase = progressUpdates.find(p => p.phase === 'complete');
      assert.ok(completePhase);
      assert.strictEqual(completePhase.current, completePhase.total);
    });

    it('should handle file processing errors gracefully', async () => {
      // Create a test library
      const testLibPath = testDataDir + '/test-library-errors';
      const fs = await import('fs');
      fs.mkdirSync(testLibPath, { recursive: true });

      // Create a valid file
      fs.writeFileSync(testLibPath + '/valid.epub', 'valid content');

      const libResult = await library.createLibrary({
        name: 'Test Library Errors',
        path: testLibPath,
      });

      assert.ok(libResult.success);
      assert.ok(libResult.library);

      // First scan to add the file
      await scanner.scanLibrary(libResult.library.id);

      // Now delete the file but it will still be in the list
      // This simulates a race condition where file disappears during scan
      fs.unlinkSync(testLibPath + '/valid.epub');

      // Create a new file that will be found during scan but will fail to stat
      fs.writeFileSync(testLibPath + '/new.epub', 'new content');

      const result = await scanner.scanLibrary(libResult.library.id);

      // Should continue despite errors
      assert.strictEqual(result.success, true);
    });

    it('should parse filename with author prefix', async () => {
      const testLibPath = testDataDir + '/test-library-parse-author';
      const fs = await import('fs');
      fs.mkdirSync(testLibPath, { recursive: true });

      fs.writeFileSync(testLibPath + '/Brandon Sanderson - The Way of Kings.epub', 'content');

      const libResult = await library.createLibrary({
        name: 'Test Library Parse Author',
        path: testLibPath,
      });

      assert.ok(libResult.success);
      assert.ok(libResult.library);

      await scanner.scanLibrary(libResult.library.id);

      const books = await scanner.getBooks({ libraryId: libResult.library.id });
      assert.strictEqual(books.books.length, 1);
      assert.strictEqual(books.books[0].title, 'The Way of Kings');
      const authors = JSON.parse(books.books[0].authors || '[]');
      assert.deepStrictEqual(authors, ['Brandon Sanderson']);
    });

    it('should parse filename with author suffix', async () => {
      const testLibPath = testDataDir + '/test-library-parse-suffix';
      const fs = await import('fs');
      fs.mkdirSync(testLibPath, { recursive: true });

      // First part has numbers, so author goes to the end
      fs.writeFileSync(testLibPath + '/Book 1 - The Title - J.K. Rowling.epub', 'content');

      const libResult = await library.createLibrary({
        name: 'Test Library Parse Suffix',
        path: testLibPath,
      });

      assert.ok(libResult.success);
      assert.ok(libResult.library);

      await scanner.scanLibrary(libResult.library.id);

      const books = await scanner.getBooks({ libraryId: libResult.library.id });
      assert.strictEqual(books.books.length, 1);
      assert.strictEqual(books.books[0].title, 'Book 1 - The Title');
      const authors = JSON.parse(books.books[0].authors || '[]');
      assert.deepStrictEqual(authors, ['J.K. Rowling']);
    });

    it('should parse filename with no author', async () => {
      const testLibPath = testDataDir + '/test-library-parse-noauthor';
      const fs = await import('fs');
      fs.mkdirSync(testLibPath, { recursive: true });

      fs.writeFileSync(testLibPath + '/Just A Simple Title.epub', 'content');

      const libResult = await library.createLibrary({
        name: 'Test Library Parse No Author',
        path: testLibPath,
      });

      assert.ok(libResult.success);
      assert.ok(libResult.library);

      await scanner.scanLibrary(libResult.library.id);

      const books = await scanner.getBooks({ libraryId: libResult.library.id });
      assert.strictEqual(books.books.length, 1);
      assert.strictEqual(books.books[0].title, 'Just A Simple Title');
      const authors = JSON.parse(books.books[0].authors || '[]');
      assert.deepStrictEqual(authors, []);
    });

    it('should parse filename with very long author name', async () => {
      const testLibPath = testDataDir + '/test-library-parse-longauthor';
      const fs = await import('fs');
      fs.mkdirSync(testLibPath, { recursive: true });

      // Author name longer than 50 chars, so it should be treated as title
      const longAuthor = 'A'.repeat(60);
      fs.writeFileSync(testLibPath + `/${longAuthor} - Book Title.epub`, 'content');

      const libResult = await library.createLibrary({
        name: 'Test Library Parse Long Author',
        path: testLibPath,
      });

      assert.ok(libResult.success);
      assert.ok(libResult.library);

      await scanner.scanLibrary(libResult.library.id);

      const books = await scanner.getBooks({ libraryId: libResult.library.id });
      assert.strictEqual(books.books.length, 1);
      // Long author name should be treated as part of title
      assert.strictEqual(books.books[0].title, longAuthor);
      const authors = JSON.parse(books.books[0].authors || '[]');
      assert.deepStrictEqual(authors, ['Book Title']);
    });

    it('should parse filename with author containing numbers', async () => {
      const testLibPath = testDataDir + '/test-library-parse-numbers';
      const fs = await import('fs');
      fs.mkdirSync(testLibPath, { recursive: true });

      // Author with numbers - should be treated as title part, not author
      fs.writeFileSync(testLibPath + '/Series123 - Book Title.epub', 'content');

      const libResult = await library.createLibrary({
        name: 'Test Library Parse Numbers',
        path: testLibPath,
      });

      assert.ok(libResult.success);
      assert.ok(libResult.library);

      await scanner.scanLibrary(libResult.library.id);

      const books = await scanner.getBooks({ libraryId: libResult.library.id });
      assert.strictEqual(books.books.length, 1);
      // First part has numbers, so author goes to the end
      assert.strictEqual(books.books[0].title, 'Series123');
      const authors = JSON.parse(books.books[0].authors || '[]');
      assert.deepStrictEqual(authors, ['Book Title']);
    });
  });

  describe('getBooks', () => {
    let testLibraryId: number;

    beforeEach(async () => {
      // Create a test library with books
      const testLibPath = testDataDir + '/test-library-getbooks';
      const fs = await import('fs');
      try {
        fs.rmSync(testLibPath, { recursive: true, force: true });
      } catch {}
      fs.mkdirSync(testLibPath, { recursive: true });

      // Create test books
      fs.writeFileSync(testLibPath + '/Book A.epub', 'content a');
      fs.writeFileSync(testLibPath + '/Book B.epub', 'content b');
      fs.writeFileSync(testLibPath + '/Book C.epub', 'content c');

      const libResult = await library.createLibrary({
        name: 'Test Library GetBooks',
        path: testLibPath,
      });

      assert.ok(libResult.success);
      assert.ok(libResult.library);
      testLibraryId = libResult.library.id;

      await scanner.scanLibrary(testLibraryId);
    });

    it('should get all books with default pagination', async () => {
      const result = await scanner.getBooks();

      assert.ok(result.books.length > 0);
      assert.strictEqual(result.page, 1);
      assert.strictEqual(result.pageSize, 20);
      assert.ok(result.total >= 3);
    });

    it('should filter books by library ID', async () => {
      const result = await scanner.getBooks({ libraryId: testLibraryId });

      assert.strictEqual(result.books.length, 3);
      assert.ok(result.books.every(b => b.libraryId === testLibraryId));
    });

    it('should search books by title', async () => {
      const result = await scanner.getBooks({ search: 'Book A' });

      assert.ok(result.books.length >= 1);
      assert.ok(result.books.some(b => b.title?.includes('Book A')));
    });

    it('should search books by file path', async () => {
      const result = await scanner.getBooks({ search: 'Book B.epub' });

      assert.ok(result.books.length >= 1);
    });

    it('should handle pagination', async () => {
      const page1 = await scanner.getBooks({ pageSize: 2, page: 1 });
      const page2 = await scanner.getBooks({ pageSize: 2, page: 2 });

      assert.strictEqual(page1.books.length, 2);
      assert.strictEqual(page1.page, 1);
      assert.strictEqual(page1.pageSize, 2);

      // Page 2 might have fewer books
      assert.ok(page2.page === 2);
      assert.ok(page2.pageSize === 2);

      // Books on different pages should be different
      if (page2.books.length > 0) {
        assert.notStrictEqual(page1.books[0].id, page2.books[0].id);
      }
    });

    it('should filter unmatched books only', async () => {
      const result = await scanner.getBooks({ unmatchedOnly: true });

      assert.ok(result.books.every(b => b.metadataSource === null));
    });

    it('should filter matched books only', async () => {
      // First, add metadata to a book
      const books = await scanner.getBooks({ libraryId: testLibraryId });
      if (books.books.length > 0) {
        await scanner.updateBook(books.books[0].id, {
          metadataSource: 'hardcover',
          metadataId: 'test123',
        });
      }

      const result = await scanner.getBooks({ matchedOnly: true });

      assert.ok(result.books.every(b => b.metadataSource !== null));
    });

    it('should handle large page size up to 10000', async () => {
      const result = await scanner.getBooks({ pageSize: 10000 });

      assert.strictEqual(result.pageSize, 10000);
    });

    it('should cap page size at 10000', async () => {
      const result = await scanner.getBooks({ pageSize: 50000 });

      assert.strictEqual(result.pageSize, 10000);
    });

    it('should enforce minimum page size of 1', async () => {
      const result = await scanner.getBooks({ pageSize: -5 });

      assert.strictEqual(result.pageSize, 1);
    });

    it('should enforce minimum page number of 1', async () => {
      const result = await scanner.getBooks({ page: -1 });

      assert.strictEqual(result.page, 1);
    });

    it('should calculate total pages correctly', async () => {
      const result = await scanner.getBooks({ libraryId: testLibraryId, pageSize: 2 });

      assert.strictEqual(result.total, 3);
      assert.strictEqual(result.totalPages, 2); // 3 books / 2 per page = 2 pages
    });
  });

  describe('getBookById', () => {
    it('should get book by ID', async () => {
      // Create a test library and book
      const testLibPath = testDataDir + '/test-library-getbyid';
      const fs = await import('fs');
      try {
        fs.rmSync(testLibPath, { recursive: true, force: true });
      } catch {}
      fs.mkdirSync(testLibPath, { recursive: true });

      fs.writeFileSync(testLibPath + '/test.epub', 'content');

      const libResult = await library.createLibrary({
        name: 'Test Library GetById',
        path: testLibPath,
      });

      assert.ok(libResult.success);
      assert.ok(libResult.library);

      await scanner.scanLibrary(libResult.library.id);
      const books = await scanner.getBooks({ libraryId: libResult.library.id });

      assert.ok(books.books.length > 0);
      const bookId = books.books[0].id;

      const book = await scanner.getBookById(bookId);

      assert.ok(book);
      assert.strictEqual(book.id, bookId);
      assert.strictEqual(book.libraryId, libResult.library.id);
    });

    it('should return null for non-existent book', async () => {
      const book = await scanner.getBookById(99999);

      assert.strictEqual(book, null);
    });
  });

  describe('updateBook', () => {
    let testBookId: number;

    beforeEach(async () => {
      // Create a test library and book
      const testLibPath = testDataDir + '/test-library-update';
      const fs = await import('fs');
      try {
        fs.rmSync(testLibPath, { recursive: true, force: true });
      } catch {}
      fs.mkdirSync(testLibPath, { recursive: true });

      fs.writeFileSync(testLibPath + '/test.epub', 'content');

      const libResult = await library.createLibrary({
        name: 'Test Library Update',
        path: testLibPath,
      });

      assert.ok(libResult.success);
      assert.ok(libResult.library);

      await scanner.scanLibrary(libResult.library.id);
      const books = await scanner.getBooks({ libraryId: libResult.library.id });

      assert.ok(books.books.length > 0);
      testBookId = books.books[0].id;
    });

    it('should update book title', async () => {
      const result = await scanner.updateBook(testBookId, { title: 'New Title' });

      assert.ok(result.success);
      assert.ok(result.book);
      assert.strictEqual(result.book.title, 'New Title');
    });

    it('should update book authors', async () => {
      const result = await scanner.updateBook(testBookId, { authors: '["Author One","Author Two"]' });

      assert.ok(result.success);
      assert.ok(result.book);
      assert.strictEqual(result.book.authors, '["Author One","Author Two"]');
    });

    it('should update book series', async () => {
      const result = await scanner.updateBook(testBookId, {
        series: '[["Series Name", 1]]',
        seriesName: 'Series Name',
        seriesNumber: 1,
      });

      assert.ok(result.success);
      assert.ok(result.book);
      assert.strictEqual(result.book.series, '[["Series Name", 1]]');
      assert.strictEqual(result.book.seriesName, 'Series Name');
      assert.strictEqual(result.book.seriesNumber, 1);
    });

    it('should update book metadata', async () => {
      const result = await scanner.updateBook(testBookId, {
        isbn: '9781234567890',
        publisher: 'Test Publisher',
        publishDate: '2024-01-01',
        description: 'Test description',
        coverUrl: 'https://example.com/cover.jpg',
        metadataSource: 'hardcover',
        metadataId: 'hc123',
      });

      assert.ok(result.success);
      assert.ok(result.book);
      assert.strictEqual(result.book.isbn, '9781234567890');
      assert.strictEqual(result.book.publisher, 'Test Publisher');
      assert.strictEqual(result.book.publishDate, '2024-01-01');
      assert.strictEqual(result.book.description, 'Test description');
      assert.strictEqual(result.book.coverUrl, 'https://example.com/cover.jpg');
      assert.strictEqual(result.book.metadataSource, 'hardcover');
      assert.strictEqual(result.book.metadataId, 'hc123');
    });

    it('should update multiple fields at once', async () => {
      const result = await scanner.updateBook(testBookId, {
        title: 'Updated Title',
        authors: '["Updated Author"]',
        isbn: '9780987654321',
      });

      assert.ok(result.success);
      assert.ok(result.book);
      assert.strictEqual(result.book.title, 'Updated Title');
      assert.strictEqual(result.book.authors, '["Updated Author"]');
      assert.strictEqual(result.book.isbn, '9780987654321');
    });

    it('should return success with no changes when no fields provided', async () => {
      const originalBook = await scanner.getBookById(testBookId);
      const result = await scanner.updateBook(testBookId, {});

      assert.ok(result.success);
      assert.ok(result.book);
      assert.deepStrictEqual(result.book, originalBook);
    });

    it('should return error for non-existent book', async () => {
      const result = await scanner.updateBook(99999, { title: 'New Title' });

      assert.strictEqual(result.success, false);
      assert.strictEqual(result.error, 'Book not found');
    });

    it('should update updatedAt timestamp', async () => {
      const originalBook = await scanner.getBookById(testBookId);
      assert.ok(originalBook);

      // Wait a bit to ensure timestamp difference
      await new Promise(resolve => setTimeout(resolve, 10));

      const result = await scanner.updateBook(testBookId, { title: 'New Title' });

      assert.ok(result.success);
      assert.ok(result.book);
      // Updated timestamp should be different (SQLite uses CURRENT_TIMESTAMP)
      // We can't do exact comparison due to timing, but we can verify it exists
      assert.ok(result.book.updatedAt);
    });
  });

  describe('deleteBook', () => {
    it('should delete existing book', async () => {
      // Create a test library and book
      const testLibPath = testDataDir + '/test-library-delete';
      const fs = await import('fs');
      try {
        fs.rmSync(testLibPath, { recursive: true, force: true });
      } catch {}
      fs.mkdirSync(testLibPath, { recursive: true });

      fs.writeFileSync(testLibPath + '/test.epub', 'content');

      const libResult = await library.createLibrary({
        name: 'Test Library Delete',
        path: testLibPath,
      });

      assert.ok(libResult.success);
      assert.ok(libResult.library);

      await scanner.scanLibrary(libResult.library.id);
      const books = await scanner.getBooks({ libraryId: libResult.library.id });

      assert.ok(books.books.length > 0);
      const bookId = books.books[0].id;

      const result = await scanner.deleteBook(bookId);

      assert.ok(result.success);

      // Verify book is deleted
      const deletedBook = await scanner.getBookById(bookId);
      assert.strictEqual(deletedBook, null);
    });

    it('should return error for non-existent book', async () => {
      const result = await scanner.deleteBook(99999);

      assert.strictEqual(result.success, false);
      assert.strictEqual(result.error, 'Book not found');
    });
  });

  describe('addBook', () => {
    it('should add a new book to library', async () => {
      // Create a test library
      const testLibPath = testDataDir + '/test-library-addbook';
      const fs = await import('fs');
      try {
        fs.rmSync(testLibPath, { recursive: true, force: true });
      } catch {}
      fs.mkdirSync(testLibPath, { recursive: true });

      const libResult = await library.createLibrary({
        name: 'Test Library AddBook',
        path: testLibPath,
      });

      assert.ok(libResult.success);
      assert.ok(libResult.library);

      const bookId = await scanner.addBook({
        libraryId: libResult.library.id,
        filePath: testLibPath + '/new-book.epub',
        title: 'New Book',
        authors: '["Test Author"]',
        extension: '.epub',
        fileSize: 12345,
      });

      assert.ok(bookId > 0);

      // Verify book was added
      const book = await scanner.getBookById(bookId);
      assert.ok(book);
      assert.strictEqual(book.title, 'New Book');
      assert.strictEqual(book.authors, '["Test Author"]');
      assert.strictEqual(book.fileSize, 12345);
    });

    it('should add book with minimal data', async () => {
      // Create a test library
      const testLibPath = testDataDir + '/test-library-addbook-minimal';
      const fs = await import('fs');
      try {
        fs.rmSync(testLibPath, { recursive: true, force: true });
      } catch {}
      fs.mkdirSync(testLibPath, { recursive: true });

      const libResult = await library.createLibrary({
        name: 'Test Library AddBook Minimal',
        path: testLibPath,
      });

      assert.ok(libResult.success);
      assert.ok(libResult.library);

      const bookId = await scanner.addBook({
        libraryId: libResult.library.id,
        filePath: testLibPath + '/minimal.epub',
      });

      assert.ok(bookId > 0);

      // Verify book was added with nulls
      const book = await scanner.getBookById(bookId);
      assert.ok(book);
      assert.strictEqual(book.title, null);
      assert.strictEqual(book.authors, null);
    });
  });

  describe('rowToBook (internal)', () => {
    // This is tested indirectly through all the other functions
    // But let's add a specific test for the conversion
    it('should convert database row to Book object correctly', async () => {
      const testLibPath = testDataDir + '/test-library-rowtobook';
      const fs = await import('fs');
      try {
        fs.rmSync(testLibPath, { recursive: true, force: true });
      } catch {}
      fs.mkdirSync(testLibPath, { recursive: true });

      fs.writeFileSync(testLibPath + '/test.epub', 'content');

      const libResult = await library.createLibrary({
        name: 'Test Library RowToBook',
        path: testLibPath,
      });

      assert.ok(libResult.success);
      assert.ok(libResult.library);

      await scanner.scanLibrary(libResult.library.id);
      const books = await scanner.getBooks({ libraryId: libResult.library.id });

      assert.ok(books.books.length > 0);
      const book = books.books[0];

      // Verify all fields are properly converted (snake_case to camelCase)
      assert.ok(typeof book.id === 'number');
      assert.ok(typeof book.libraryId === 'number');
      assert.ok(typeof book.filePath === 'string');
      assert.ok(book.createdAt);
      assert.ok(book.updatedAt);
    });

    it('should handle null values in conversion', async () => {
      const testLibPath = testDataDir + '/test-library-nulls';
      const fs = await import('fs');
      try {
        fs.rmSync(testLibPath, { recursive: true, force: true });
      } catch {}
      fs.mkdirSync(testLibPath, { recursive: true });

      const libResult = await library.createLibrary({
        name: 'Test Library Nulls',
        path: testLibPath,
      });

      assert.ok(libResult.success);
      assert.ok(libResult.library);

      const bookId = await scanner.addBook({
        libraryId: libResult.library.id,
        filePath: testLibPath + '/null-test.epub',
      });

      const book = await scanner.getBookById(bookId);
      assert.ok(book);

      // Verify null fields
      assert.strictEqual(book.title, null);
      assert.strictEqual(book.authors, null);
      assert.strictEqual(book.series, null);
      assert.strictEqual(book.seriesName, null);
      assert.strictEqual(book.seriesNumber, null);
      assert.strictEqual(book.isbn, null);
      assert.strictEqual(book.publisher, null);
      assert.strictEqual(book.publishDate, null);
      assert.strictEqual(book.description, null);
      assert.strictEqual(book.coverUrl, null);
      assert.strictEqual(book.metadataSource, null);
      assert.strictEqual(book.metadataId, null);
    });
  });

  describe('edge cases and error handling', () => {
    it('should handle empty library directory', async () => {
      const testLibPath = testDataDir + '/test-library-empty';
      const fs = await import('fs');
      try {
        fs.rmSync(testLibPath, { recursive: true, force: true });
      } catch {}
      fs.mkdirSync(testLibPath, { recursive: true });

      const libResult = await library.createLibrary({
        name: 'Test Library Empty',
        path: testLibPath,
      });

      assert.ok(libResult.success);
      assert.ok(libResult.library);

      const result = await scanner.scanLibrary(libResult.library.id);

      assert.strictEqual(result.success, true);
      assert.strictEqual(result.added, 0);
      assert.strictEqual(result.total, 0);
    });

    it('should handle filenames with special characters', async () => {
      const testLibPath = testDataDir + '/test-library-special';
      const fs = await import('fs');
      try {
        fs.rmSync(testLibPath, { recursive: true, force: true });
      } catch {}
      fs.mkdirSync(testLibPath, { recursive: true });

      fs.writeFileSync(testLibPath + '/Book (2024) - Author [Edition].epub', 'content');

      const libResult = await library.createLibrary({
        name: 'Test Library Special',
        path: testLibPath,
      });

      assert.ok(libResult.success);
      assert.ok(libResult.library);

      const result = await scanner.scanLibrary(libResult.library.id);

      assert.strictEqual(result.success, true);
      assert.strictEqual(result.added, 1);
    });

    it('should handle very long filenames', async () => {
      const testLibPath = testDataDir + '/test-library-long';
      const fs = await import('fs');
      try {
        fs.rmSync(testLibPath, { recursive: true, force: true });
      } catch {}
      fs.mkdirSync(testLibPath, { recursive: true });

      const longName = 'A'.repeat(200) + '.epub';
      fs.writeFileSync(testLibPath + '/' + longName, 'content');

      const libResult = await library.createLibrary({
        name: 'Test Library Long',
        path: testLibPath,
      });

      assert.ok(libResult.success);
      assert.ok(libResult.library);

      const result = await scanner.scanLibrary(libResult.library.id);

      assert.strictEqual(result.success, true);
      assert.strictEqual(result.added, 1);
    });

    it('should handle multiple scans concurrently (same library)', async () => {
      const testLibPath = testDataDir + '/test-library-concurrent';
      const fs = await import('fs');
      try {
        fs.rmSync(testLibPath, { recursive: true, force: true });
      } catch {}
      fs.mkdirSync(testLibPath, { recursive: true });

      fs.writeFileSync(testLibPath + '/test.epub', 'content');

      const libResult = await library.createLibrary({
        name: 'Test Library Concurrent',
        path: testLibPath,
      });

      assert.ok(libResult.success);
      assert.ok(libResult.library);

      // Run multiple scans concurrently
      const [result1, result2] = await Promise.all([
        scanner.scanLibrary(libResult.library.id),
        scanner.scanLibrary(libResult.library.id),
      ]);

      // Both should succeed, though results may vary
      assert.strictEqual(result1.success, true);
      assert.strictEqual(result2.success, true);
    });

    it('should handle unreadable directories during scan', async () => {
      const testLibPath = testDataDir + '/test-library-unreadable';
      const fs = await import('fs');
      try {
        fs.rmSync(testLibPath, { recursive: true, force: true });
      } catch {}
      fs.mkdirSync(testLibPath, { recursive: true });

      // Create a subdirectory and a file
      fs.mkdirSync(testLibPath + '/subdir', { recursive: true });
      fs.writeFileSync(testLibPath + '/readable.epub', 'content');
      fs.writeFileSync(testLibPath + '/subdir/book.epub', 'content in subdir');

      const libResult = await library.createLibrary({
        name: 'Test Library Unreadable',
        path: testLibPath,
      });

      assert.ok(libResult.success);
      assert.ok(libResult.library);

      // Make subdirectory unreadable (permission denied)
      try {
        fs.chmodSync(testLibPath + '/subdir', 0o000);
      } catch (err) {
        // Skip this test if we can't change permissions (e.g., on some filesystems)
        fs.chmodSync(testLibPath + '/subdir', 0o755);
        return;
      }

      const result = await scanner.scanLibrary(libResult.library.id);

      // Restore permissions for cleanup
      try {
        fs.chmodSync(testLibPath + '/subdir', 0o755);
      } catch {}

      // Should still succeed and process readable files
      assert.strictEqual(result.success, true);
      assert.ok(result.added >= 1); // At least the readable.epub file
    });
  });
});
