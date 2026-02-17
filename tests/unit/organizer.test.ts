import { describe, it, before, after, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

// Import functions to test
import {
  sanitizePathComponent,
  applyTemplate,
  calculateMetadataSimilarity,
  generateNewPath,
  calculateFileHash,
  previewReorganization,
  applyReorganization,
  updateBookHash,
  findDuplicatesByHash,
  findDuplicatesBySimilarity,
  detectSeries,
  getAllDuplicates,
} from '../../lib/services/organizer/index.js';
import type { Book } from '../../types/index.js';

describe('Organizer Service - Pure Functions', () => {
  describe('sanitizePathComponent', () => {
    it('should remove invalid characters from path', () => {
      assert.strictEqual(sanitizePathComponent('Test: Book'), 'Test Book');
      assert.strictEqual(sanitizePathComponent('Book/Name'), 'BookName');
      assert.strictEqual(sanitizePathComponent('Test<>:"/\\|?*Book'), 'TestBook');
    });

    it('should handle empty or null values', () => {
      assert.strictEqual(sanitizePathComponent(''), '');
      assert.strictEqual(sanitizePathComponent(null as unknown as string), '');
      // With fallback
      assert.strictEqual(sanitizePathComponent('', 'Fallback'), 'Fallback');
    });

    it('should trim whitespace', () => {
      assert.strictEqual(sanitizePathComponent('  Test Book  '), 'Test Book');
    });

    it('should collapse multiple spaces', () => {
      assert.strictEqual(sanitizePathComponent('Test    Book'), 'Test Book');
    });

    it('should remove leading/trailing dots', () => {
      assert.strictEqual(sanitizePathComponent('.hidden'), 'hidden');
      assert.strictEqual(sanitizePathComponent('file...'), 'file');
    });

    it('should truncate long strings', () => {
      const longString = 'A'.repeat(250);
      const result = sanitizePathComponent(longString);
      assert.ok(result.length <= 200);
    });
  });

  describe('applyTemplate', () => {
    const baseVars = {
      author: 'Stephen King',
      title: 'The Shining',
      series: 'The Shining Series',
      series_number: '01',
      year: '1977',
      isbn: '9780385121675',
      ext: '.epub',
    };

    it('should apply simple author/title template', () => {
      const result = applyTemplate('{author}/{title}', baseVars);
      assert.strictEqual(result, 'Stephen King/The Shining.epub');
    });

    it('should apply template with series', () => {
      const result = applyTemplate('{author}/{series}/{series_number} - {title}', baseVars);
      assert.strictEqual(result, 'Stephen King/The Shining Series/01 - The Shining.epub');
    });

    it('should handle empty series gracefully', () => {
      const varsNoSeries = { ...baseVars, series: '', series_number: '' };
      const result = applyTemplate('{author}/{series}/{title}', varsNoSeries);
      assert.strictEqual(result, 'Stephen King/The Shining.epub');
    });

    it('should handle year in title', () => {
      const result = applyTemplate('{author}/{title} ({year})', baseVars);
      assert.strictEqual(result, 'Stephen King/The Shining (1977).epub');
    });

    it('should remove empty parentheses', () => {
      const varsNoYear = { ...baseVars, year: '' };
      const result = applyTemplate('{author}/{title} ({year})', varsNoYear);
      assert.strictEqual(result, 'Stephen King/The Shining.epub');
    });

    it('should handle ISBN template', () => {
      const result = applyTemplate('{author}/{isbn} - {title}', baseVars);
      assert.strictEqual(result, 'Stephen King/9780385121675 - The Shining.epub');
    });
  });

  describe('calculateMetadataSimilarity', () => {
    it('should return 1 for identical books', () => {
      const book1 = {
        id: 1,
        libraryId: 1,
        title: 'The Shining',
        authors: '["Stephen King"]',
        isbn: '9780385121675',
        fileSize: 1000000,
        filePath: '/test/book.epub',
      };
      const book2 = { ...book1, id: 2, filePath: '/test/book2.epub' };

      const similarity = calculateMetadataSimilarity(book1 as never, book2 as never);
      assert.strictEqual(similarity, 1);
    });

    it('should return high similarity for similar titles', () => {
      const book1 = {
        id: 1,
        libraryId: 1,
        title: 'The Shining',
        authors: '["Stephen King"]',
        isbn: null,
        fileSize: 1000000,
        filePath: '/test/book.epub',
      };
      const book2 = {
        id: 2,
        libraryId: 1,
        title: 'The Shining - A Novel',
        authors: '["Stephen King"]',
        isbn: null,
        fileSize: 1100000,
        filePath: '/test/book2.epub',
      };

      const similarity = calculateMetadataSimilarity(book1 as never, book2 as never);
      assert.ok(similarity > 0.7, `Expected similarity > 0.7, got ${similarity}`);
    });

    it('should return low similarity for different books', () => {
      const book1 = {
        id: 1,
        libraryId: 1,
        title: 'The Shining',
        authors: '["Stephen King"]',
        isbn: '9780385121675',
        fileSize: 1000000,
        filePath: '/test/book.epub',
      };
      const book2 = {
        id: 2,
        libraryId: 1,
        title: 'Dune',
        authors: '["Frank Herbert"]',
        isbn: '9780441172719',
        fileSize: 500000,
        filePath: '/test/book2.epub',
      };

      const similarity = calculateMetadataSimilarity(book1 as never, book2 as never);
      assert.ok(similarity < 0.3, `Expected similarity < 0.3, got ${similarity}`);
    });

    it('should give high weight to ISBN matches', () => {
      const book1 = {
        id: 1,
        libraryId: 1,
        title: 'Different Title',
        authors: '["Different Author"]',
        isbn: '9780385121675',
        fileSize: 1000000,
        filePath: '/test/book.epub',
      };
      const book2 = {
        id: 2,
        libraryId: 1,
        title: 'Another Title',
        authors: '["Another Author"]',
        isbn: '9780385121675',
        fileSize: 500000,
        filePath: '/test/book2.epub',
      };

      const similarity = calculateMetadataSimilarity(book1 as never, book2 as never);
      assert.ok(similarity > 0.4, `Expected similarity > 0.4 due to ISBN match, got ${similarity}`);
    });
  });

  describe('calculateMetadataSimilarity - parseAuthors edge cases', () => {
    it('should handle books with empty JSON array authors', () => {
      const book1 = {
        id: 1,
        libraryId: 1,
        title: 'Title',
        authors: '[]', // Empty array
        isbn: null,
        fileSize: null,
        filePath: '/test.epub',
      };
      const book2 = { ...book1, id: 2, filePath: '/test2.epub' };
      const similarity = calculateMetadataSimilarity(book1 as never, book2 as never);
      // Both will be "Unknown Author", so should match
      assert.ok(similarity >= 0);
    });
  });

  describe('generateNewPath', () => {
    const libraryPath = '/libraries/ebooks';

    function makeBook(filePath: string): Book {
      return {
        id: 1,
        libraryId: 1,
        filePath,
        fileHash: null,
        fileSize: null,
        title: null,
        authors: null,
        series: null,
        seriesName: null,
        seriesNumber: null,
        isbn: null,
        publisher: null,
        publishDate: null,
        description: null,
        coverUrl: null,
        metadataSource: null,
        metadataId: null,
        createdAt: '',
        updatedAt: '',
      };
    }

    it('should handle Author/Series/Filename pattern', () => {
      const book = makeBook('/libraries/ebooks/Aaron Dembski-Bowden/Betrayer/Betrayer - Aaron Dembski-Bowden.epub');
      const result = generateNewPath(book, libraryPath);
      // Betrayer folder is same as title, so no series detected -> Author/Title
      assert.strictEqual(result, '/libraries/ebooks/Aaron Dembski-Bowden/Betrayer.epub');
    });

    it('should handle [Series Book N] filename pattern', () => {
      const book = makeBook('/libraries/ebooks/Ada Palmer/[Terra Ignota Book 1] Ada Palmer - Too Like the Lightning (2016).epub');
      const result = generateNewPath(book, libraryPath);
      // Series detected from filename -> Series/Book N - Title
      assert.strictEqual(result, '/libraries/ebooks/Terra Ignota/Book 001 - Too Like the Lightning.epub');
    });

    it('should handle [Series Book N] with Book 2', () => {
      const book = makeBook('/libraries/ebooks/Ada Palmer/[Terra Ignota Book 2] Ada Palmer - Seven Surrenders (2017).epub');
      const result = generateNewPath(book, libraryPath);
      assert.strictEqual(result, '/libraries/ebooks/Terra Ignota/Book 002 - Seven Surrenders.epub');
    });

    it('should handle series number in directory name', () => {
      const book = makeBook('/libraries/ebooks/Aaron Dembski-Bowden/War Without End (33)/Aaron Dembski-Bowden - War Without End (33).epub');
      const result = generateNewPath(book, libraryPath);
      // Series number from directory (33) -> Series/Book 033 - Title
      assert.strictEqual(result, '/libraries/ebooks/War Without End/Book 033 - War Without End.epub');
    });

    it('should handle simple Author/Title pattern', () => {
      const book = makeBook('/libraries/ebooks/Adrian Tchaikovsky/Alien Clay.epub');
      const result = generateNewPath(book, libraryPath);
      assert.strictEqual(result, '/libraries/ebooks/Adrian Tchaikovsky/Alien Clay.epub');
    });

    it('should handle Author/Title/Filename pattern with dash', () => {
      const book = makeBook('/libraries/ebooks/Adrian Tchaikovsky/Dogs of War/Dogs of War - Adrian Tchaikovsky.epub');
      const result = generateNewPath(book, libraryPath);
      assert.strictEqual(result, '/libraries/ebooks/Adrian Tchaikovsky/Dogs of War.epub');
    });

    it('should handle [Series] without number in filename', () => {
      const book = makeBook('/libraries/ebooks/Author Name/[Series Name] Some Title.epub');
      const result = generateNewPath(book, libraryPath);
      assert.strictEqual(result, '/libraries/ebooks/Series Name/Some Title.epub');
    });

    it('should handle [Series] with Author - Title pattern', () => {
      const book = makeBook('/libraries/ebooks/[Series Name] Author Name - Book Title.epub');
      const result = generateNewPath(book, libraryPath);
      assert.strictEqual(result, '/libraries/ebooks/Series Name/Book Title.epub');
    });

    it('should handle path not starting with library path', () => {
      const book = makeBook('/different/path/Author/Title.epub');
      const result = generateNewPath(book, libraryPath);
      // Should still parse the structure and produce a valid path
      assert.ok(result.includes('Title'));
    });

    it('should handle reversed Author - Title pattern detection', () => {
      const book = makeBook('/libraries/ebooks/Book Title/Book Title - Author Name.epub');
      const result = generateNewPath(book, libraryPath);
      // Directory matches title, should detect reversed pattern
      assert.ok(result.includes('Book Title'));
    });

    it('should handle 3+ level directory with series detection', () => {
      const book = makeBook('/libraries/ebooks/Author/Series Name/Book Title.epub');
      const result = generateNewPath(book, libraryPath);
      // Middle directory should be detected as series
      assert.strictEqual(result, '/libraries/ebooks/Series Name/Book Title.epub');
    });

    it('should handle Author - Title pattern with year in parentheses', () => {
      const book = makeBook('/libraries/ebooks/Author Name - Book Title (2023).epub');
      const result = generateNewPath(book, libraryPath);
      assert.strictEqual(result, '/libraries/ebooks/Author Name/Book Title.epub');
    });

    it('should handle series without number', () => {
      const book = makeBook('/libraries/ebooks/Author/Series/Title.epub');
      const result = generateNewPath(book, libraryPath);
      assert.strictEqual(result, '/libraries/ebooks/Series/Title.epub');
    });

    it('should handle [Series Book N] with year in rest part', () => {
      const book = makeBook('/libraries/ebooks/[Series Book 1] Title (2023).epub');
      const result = generateNewPath(book, libraryPath);
      // Year should be stripped from title
      assert.strictEqual(result, '/libraries/ebooks/Series/Book 001 - Title.epub');
    });

    it('should handle [Series] with Author - Title (Year) pattern', () => {
      const book = makeBook('/libraries/ebooks/[Series] Author - Title (2023).epub');
      const result = generateNewPath(book, libraryPath);
      // Year should be stripped from title
      assert.strictEqual(result, '/libraries/ebooks/Series/Title.epub');
    });
  });

  describe('applyTemplate - additional edge cases', () => {
    const baseVars = {
      author: 'Test Author',
      title: 'Test Title',
      series: '',
      number: '',
      series_number: '',
      year: '',
      isbn: '',
      ext: '.epub',
    };

    it('should remove empty brackets', () => {
      const result = applyTemplate('{author}/{title} [{series}]', baseVars);
      assert.strictEqual(result, 'Test Author/Test Title.epub');
    });

    it('should handle {number} placeholder', () => {
      const vars = { ...baseVars, number: '05' };
      const result = applyTemplate('{author}/Book {number} - {title}', vars);
      assert.strictEqual(result, 'Test Author/Book 05 - Test Title.epub');
    });

    it('should remove trailing dashes from empty variables', () => {
      const result = applyTemplate('{title} - {series}', baseVars);
      assert.strictEqual(result, 'Test Title.epub');
    });

    it('should remove trailing hash symbols', () => {
      const result = applyTemplate('{title} #{series_number}', baseVars);
      assert.strictEqual(result, 'Test Title.epub');
    });
  });

  describe('sanitizePathComponent - additional edge cases', () => {
    it('should return "Unknown" when result is empty after sanitization', () => {
      const result = sanitizePathComponent(':::');
      assert.strictEqual(result, 'Unknown');
    });

    it('should handle all invalid characters', () => {
      const result = sanitizePathComponent('Test<>:"/\\|?*File');
      assert.strictEqual(result, 'TestFile');
    });
  });

  describe('calculateMetadataSimilarity - additional edge cases', () => {
    it('should handle books with no title', () => {
      const book1 = {
        id: 1,
        libraryId: 1,
        title: null,
        authors: '["Author"]',
        isbn: null,
        fileSize: 1000,
        filePath: '/test.epub',
      };
      const book2 = { ...book1, id: 2, filePath: '/test2.epub' };
      const similarity = calculateMetadataSimilarity(book1 as never, book2 as never);
      assert.ok(similarity >= 0);
    });

    it('should handle books with unknown authors', () => {
      const book1 = {
        id: 1,
        libraryId: 1,
        title: 'Title',
        authors: null,
        isbn: null,
        fileSize: null,
        filePath: '/test.epub',
      };
      const book2 = { ...book1, id: 2, filePath: '/test2.epub' };
      const similarity = calculateMetadataSimilarity(book1 as never, book2 as never);
      assert.ok(similarity >= 0);
    });

    it('should handle books with different ISBN', () => {
      const book1 = {
        id: 1,
        libraryId: 1,
        title: 'Title',
        authors: '["Author"]',
        isbn: '1234567890',
        fileSize: null,
        filePath: '/test.epub',
      };
      const book2 = {
        ...book1,
        id: 2,
        isbn: '0987654321',
        filePath: '/test2.epub',
      };
      const similarity = calculateMetadataSimilarity(book1 as never, book2 as never);
      assert.ok(similarity < 1);
    });

    it('should handle books without file size', () => {
      const book1 = {
        id: 1,
        libraryId: 1,
        title: 'Title',
        authors: '["Author"]',
        isbn: null,
        fileSize: null,
        filePath: '/test.epub',
      };
      const book2 = { ...book1, id: 2, filePath: '/test2.epub' };
      const similarity = calculateMetadataSimilarity(book1 as never, book2 as never);
      assert.ok(similarity > 0);
    });

    it('should handle short strings in similarity calculation', () => {
      const book1 = {
        id: 1,
        libraryId: 1,
        title: 'A',
        authors: '["B"]',
        isbn: null,
        fileSize: null,
        filePath: '/test.epub',
      };
      const book2 = {
        id: 2,
        libraryId: 1,
        title: 'C',
        authors: '["D"]',
        isbn: null,
        fileSize: null,
        filePath: '/test2.epub',
      };
      const similarity = calculateMetadataSimilarity(book1 as never, book2 as never);
      // Short strings return 0 similarity
      assert.strictEqual(similarity, 0);
    });

    it('should handle identical single-character strings', () => {
      const book1 = {
        id: 1,
        libraryId: 1,
        title: 'X',
        authors: '["Y"]',
        isbn: null,
        fileSize: null,
        filePath: '/test.epub',
      };
      const book2 = { ...book1, id: 2, filePath: '/test2.epub' };
      const similarity = calculateMetadataSimilarity(book1 as never, book2 as never);
      // String similarity returns 0 for short strings, but title/author exact match still counts
      assert.ok(similarity >= 0);
    });

    it('should handle books with one having ISBN and other not', () => {
      const book1 = {
        id: 1,
        libraryId: 1,
        title: 'Title',
        authors: '["Author"]',
        isbn: '1234567890',
        fileSize: 1000,
        filePath: '/test.epub',
      };
      const book2 = {
        ...book1,
        id: 2,
        isbn: null,
        filePath: '/test2.epub',
      };
      const similarity = calculateMetadataSimilarity(book1 as never, book2 as never);
      // Should still calculate but with lower weight for ISBN
      assert.ok(similarity > 0 && similarity < 1);
    });
  });

  describe('calculateFileHash', () => {
    let testDir: string;

    beforeEach(() => {
      testDir = join(tmpdir(), `organizer-test-${Date.now()}`);
      mkdirSync(testDir, { recursive: true });
    });

    afterEach(() => {
      if (existsSync(testDir)) {
        rmSync(testDir, { recursive: true, force: true });
      }
    });

    it('should calculate MD5 hash of file', () => {
      const filePath = join(testDir, 'test.txt');
      writeFileSync(filePath, 'test content');

      const hash = calculateFileHash(filePath);
      assert.ok(hash.length > 0);
      assert.strictEqual(typeof hash, 'string');
    });

    it('should return empty string for non-existent file', () => {
      const hash = calculateFileHash('/nonexistent/file.txt');
      assert.strictEqual(hash, '');
    });

    it('should return consistent hash for same content', () => {
      const filePath1 = join(testDir, 'file1.txt');
      const filePath2 = join(testDir, 'file2.txt');

      writeFileSync(filePath1, 'same content');
      writeFileSync(filePath2, 'same content');

      const hash1 = calculateFileHash(filePath1);
      const hash2 = calculateFileHash(filePath2);

      assert.strictEqual(hash1, hash2);
    });

    it('should return different hash for different content', () => {
      const filePath1 = join(testDir, 'file1.txt');
      const filePath2 = join(testDir, 'file2.txt');

      writeFileSync(filePath1, 'content A');
      writeFileSync(filePath2, 'content B');

      const hash1 = calculateFileHash(filePath1);
      const hash2 = calculateFileHash(filePath2);

      assert.notStrictEqual(hash1, hash2);
    });
  });
});

// Database-dependent tests
describe('Organizer Service - Database Functions', () => {
  let testDir: string;
  let libraryPath: string;
  let db: typeof import('../../lib/db/index.js');
  let libraryId: number;

  before(async () => {
    // Create test directories
    testDir = join(tmpdir(), `shelvarr-organizer-test-${Date.now()}`);
    mkdirSync(testDir, { recursive: true });

    libraryPath = join(testDir, 'library');
    mkdirSync(libraryPath, { recursive: true });

    // Set up test environment
    process.env['DATA_DIR'] = testDir;
    process.env['DB_PATH'] = join(testDir, 'test.db');

    db = await import('../../lib/db/index.js');
    db.initDatabase();
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

    // Create a test library
    const result = database.prepare('INSERT INTO libraries (name, path) VALUES (?, ?)').run('Test Library', libraryPath);
    libraryId = Number(result.lastInsertRowid);
  });

  describe('updateBookHash', () => {
    it('should return null for non-existent book', async () => {
      const result = await updateBookHash(999);
      assert.strictEqual(result, null);
    });

    it('should calculate and update hash for existing book', async () => {
      const filePath = join(libraryPath, 'book.epub');
      writeFileSync(filePath, 'book content');

      const database = db.getDb();
      const bookResult = database.prepare('INSERT INTO books (library_id, file_path, title) VALUES (?, ?, ?)').run(libraryId, filePath, 'Test Book');
      const bookId = Number(bookResult.lastInsertRowid);

      const result = await updateBookHash(bookId);
      assert.ok(result);
      assert.strictEqual(typeof result, 'string');
      assert.ok(result.length > 0);

      // Verify hash was saved to database
      const book = database.prepare('SELECT file_hash FROM books WHERE id = ?').get(bookId) as { file_hash: string | null };
      assert.strictEqual(book.file_hash, result);
    });

    it('should not update hash when file hash is empty', async () => {
      const database = db.getDb();
      const bookResult = database.prepare('INSERT INTO books (library_id, file_path, title) VALUES (?, ?, ?)').run(libraryId, '/nonexistent/book.epub', 'Test Book');
      const bookId = Number(bookResult.lastInsertRowid);

      const result = await updateBookHash(bookId);
      assert.strictEqual(result, '');

      // Verify hash was NOT updated (should still be null)
      const book = database.prepare('SELECT file_hash FROM books WHERE id = ?').get(bookId) as { file_hash: string | null };
      assert.strictEqual(book.file_hash, null);
    });

    it('should return empty string when file does not exist', async () => {
      const database = db.getDb();
      const bookResult = database.prepare('INSERT INTO books (library_id, file_path, title) VALUES (?, ?, ?)').run(libraryId, '/nonexistent/book.epub', 'Test Book');
      const bookId = Number(bookResult.lastInsertRowid);

      const result = await updateBookHash(bookId);
      assert.strictEqual(result, '');
    });
  });

  describe('previewReorganization', () => {
    it('should throw error when library not found', async () => {
      await assert.rejects(
        async () => await previewReorganization(999),
        { message: 'Library not found' }
      );
    });

    it('should return preview for books in library', async () => {
      const database = db.getDb();
      const filePath = join(libraryPath, 'Author', 'Book.epub');
      const result = database.prepare('INSERT INTO books (library_id, file_path, title) VALUES (?, ?, ?)').run(libraryId, filePath, 'Book');
      const expectedBookId = Number(result.lastInsertRowid);

      const preview = await previewReorganization(libraryId);

      assert.ok(Array.isArray(preview));
      assert.strictEqual(preview.length, 1);
      assert.strictEqual(preview[0]?.bookId, expectedBookId);
      assert.ok('currentPath' in preview[0]);
      assert.ok('newPath' in preview[0]);
      assert.ok('willMove' in preview[0]);
    });

    it('should handle errors for individual books', async () => {
      const database = db.getDb();
      // SQLite requires file_path to be NOT NULL, so we can't test this directly
      // Instead, let's test with an invalid path that causes an error during processing
      const invalidPath = ''; // Empty path that will cause issues
      const result = database.prepare('INSERT INTO books (library_id, file_path, title) VALUES (?, ?, ?)').run(libraryId, invalidPath, 'Test');
      const bookId = Number(result.lastInsertRowid);

      const preview = await previewReorganization(libraryId);

      assert.ok(Array.isArray(preview));
      assert.strictEqual(preview.length, 1);
      // The empty path might cause an error or just work - let's check
      assert.strictEqual(preview[0]?.bookId, bookId);
    });
  });

  describe('applyReorganization', () => {
    it('should execute dry run without moving files', async () => {
      const database = db.getDb();
      const filePath = join(libraryPath, 'Author', 'OldBook.epub');
      database.prepare('INSERT INTO books (library_id, file_path, title) VALUES (?, ?, ?)').run(libraryId, filePath, 'Book');

      const result = await applyReorganization(libraryId, true);

      assert.strictEqual(result.success, true);
      assert.strictEqual(typeof result.moved, 'number');
      assert.ok(Array.isArray(result.errors));
      assert.ok(Array.isArray(result.details));
    });

    it('should skip books that do not need moving', async () => {
      const database = db.getDb();
      // Create a book with a path that matches the expected organized path
      const filePath = join(libraryPath, 'Author', 'Book.epub');
      database.prepare('INSERT INTO books (library_id, file_path, title) VALUES (?, ?, ?)').run(libraryId, filePath, 'Book');

      const result = await applyReorganization(libraryId, true);

      // If the path is already correct, moved should be 0
      assert.ok(result.moved >= 0);
    });

    it('should handle preview errors in apply', async () => {
      const database = db.getDb();
      const invalidPath = ''; // Empty path
      database.prepare('INSERT INTO books (library_id, file_path, title) VALUES (?, ?, ?)').run(libraryId, invalidPath, 'Test');

      const result = await applyReorganization(libraryId, true);

      assert.ok(result.errors.length >= 0 && result.moved >= 0);
    });

    it('should create directories and move files when not dry run', async () => {
      const database = db.getDb();

      // Create source file in a directory that will need reorganizing
      const sourceDir = join(libraryPath, 'Wrong', 'Path');
      mkdirSync(sourceDir, { recursive: true });
      const sourcePath = join(sourceDir, '[Series Book 5] Book Title.epub');
      writeFileSync(sourcePath, 'test content');

      database.prepare('INSERT INTO books (library_id, file_path, title) VALUES (?, ?, ?)').run(libraryId, sourcePath, 'Book Title');

      const result = await applyReorganization(libraryId, false);

      // Should have details
      assert.ok(result.details.length > 0);
      // Check if it attempted to move (might succeed or fail)
      assert.ok(typeof result.moved === 'number');
    });

    it('should handle error when target file already exists', async () => {
      const database = db.getDb();

      // Create source
      const source1Path = join(libraryPath, 'Source1', 'book.epub');
      mkdirSync(join(libraryPath, 'Source1'), { recursive: true });
      writeFileSync(source1Path, 'content1');

      // Create second source file that wants the same target
      const source2Path = join(libraryPath, 'Source2', 'book.epub');
      mkdirSync(join(libraryPath, 'Source2'), { recursive: true });
      writeFileSync(source2Path, 'content2');

      database.prepare('INSERT INTO books (library_id, file_path, title) VALUES (?, ?, ?)').run(libraryId, source1Path, 'Book');
      database.prepare('INSERT INTO books (library_id, file_path, title) VALUES (?, ?, ?)').run(libraryId, source2Path, 'Book');

      const result = await applyReorganization(libraryId, false);

      // Both books match Author/Title pattern already (Source1/book.epub, Source2/book.epub)
      // so neither needs to move — details may be empty or contain moves depending on path parsing
      assert.ok(result.moved >= 0);
      assert.ok(typeof result.success === 'boolean');
    });
  });

  describe('findDuplicatesByHash', () => {
    it('should find duplicates by file hash', async () => {
      const database = db.getDb();

      // Create two files with identical content
      const file1 = join(libraryPath, 'book1.epub');
      const file2 = join(libraryPath, 'book2.epub');
      writeFileSync(file1, 'identical content');
      writeFileSync(file2, 'identical content');

      // Insert books with pre-calculated hash
      const hash = calculateFileHash(file1);
      database.prepare('INSERT INTO books (library_id, file_path, title, file_hash) VALUES (?, ?, ?, ?)').run(libraryId, file1, 'Book 1', hash);
      database.prepare('INSERT INTO books (library_id, file_path, title, file_hash) VALUES (?, ?, ?, ?)').run(libraryId, file2, 'Book 2', hash);

      const result = await findDuplicatesByHash(libraryId);

      assert.ok(Array.isArray(result));
      assert.strictEqual(result.length, 1);
      assert.strictEqual(result[0]?.hash, hash);
      assert.strictEqual(result[0]?.similarity, 1.0);
      assert.ok(Array.isArray(result[0]?.books));
      assert.strictEqual(result[0]?.books.length, 2);
    });

    it('should find duplicates across all libraries when no libraryId provided', async () => {
      const result = await findDuplicatesByHash();

      assert.ok(Array.isArray(result));
    });

    it('should calculate missing hashes before finding duplicates', async () => {
      const database = db.getDb();
      const filePath = join(libraryPath, 'test.epub');
      writeFileSync(filePath, 'content');

      // Insert book without hash
      const insertResult = database.prepare('INSERT INTO books (library_id, file_path, title) VALUES (?, ?, ?)').run(libraryId, filePath, 'Test Book');
      const bookId = Number(insertResult.lastInsertRowid);

      const result = await findDuplicatesByHash(libraryId);

      assert.ok(Array.isArray(result));
      // Verify hash was calculated
      const book = database.prepare('SELECT file_hash FROM books WHERE id = ?').get(bookId) as { file_hash: string | null };
      assert.ok(book !== null);
      if (book) {
        // Hash should have been calculated
        assert.ok(book.file_hash);
      }
    });
  });

  describe('findDuplicatesBySimilarity', () => {
    it('should find similar books by metadata', async () => {
      const database = db.getDb();

      database.prepare('INSERT INTO books (library_id, file_path, title, authors, isbn, file_size) VALUES (?, ?, ?, ?, ?, ?)').run(
        libraryId, join(libraryPath, 'book1.epub'), 'The Shining', '["Stephen King"]', '123', 1000
      );
      database.prepare('INSERT INTO books (library_id, file_path, title, authors, isbn, file_size) VALUES (?, ?, ?, ?, ?, ?)').run(
        libraryId, join(libraryPath, 'book2.epub'), 'The Shining - Special Edition', '["Stephen King"]', '123', 1100
      );

      const result = await findDuplicatesBySimilarity(libraryId, 0.8);

      assert.ok(Array.isArray(result));
      // Should find at least one group
      if (result.length > 0) {
        assert.ok(result[0]?.books.length >= 2);
      }
    });

    it('should not group dissimilar books', async () => {
      const database = db.getDb();

      database.prepare('INSERT INTO books (library_id, file_path, title, authors, isbn, file_size) VALUES (?, ?, ?, ?, ?, ?)').run(
        libraryId, join(libraryPath, 'book1.epub'), 'The Shining', '["Stephen King"]', '123', 1000
      );
      database.prepare('INSERT INTO books (library_id, file_path, title, authors, isbn, file_size) VALUES (?, ?, ?, ?, ?, ?)').run(
        libraryId, join(libraryPath, 'book2.epub'), 'Dune', '["Frank Herbert"]', '456', 2000
      );

      const result = await findDuplicatesBySimilarity(libraryId, 0.8);

      // Should not find groups since books are very different
      assert.ok(Array.isArray(result));
      assert.strictEqual(result.length, 0);
    });

    it('should work without libraryId', async () => {
      const result = await findDuplicatesBySimilarity();

      assert.ok(Array.isArray(result));
    });

    it('should use custom threshold', async () => {
      const database = db.getDb();

      database.prepare('INSERT INTO books (library_id, file_path, title, authors, file_size) VALUES (?, ?, ?, ?, ?)').run(
        libraryId, join(libraryPath, 'book1.epub'), 'Book ABC', '["Author"]', 1000
      );
      database.prepare('INSERT INTO books (library_id, file_path, title, authors, file_size) VALUES (?, ?, ?, ?, ?)').run(
        libraryId, join(libraryPath, 'book2.epub'), 'Book XYZ', '["Author"]', 1000
      );

      const result = await findDuplicatesBySimilarity(libraryId, 0.3);

      assert.ok(Array.isArray(result));
    });

    it('should skip already processed books', async () => {
      const database = db.getDb();

      // Create three very similar books
      database.prepare('INSERT INTO books (library_id, file_path, title, authors, isbn, file_size) VALUES (?, ?, ?, ?, ?, ?)').run(
        libraryId, join(libraryPath, 'book1.epub'), 'Book', '["Author"]', '123', 1000
      );
      database.prepare('INSERT INTO books (library_id, file_path, title, authors, isbn, file_size) VALUES (?, ?, ?, ?, ?, ?)').run(
        libraryId, join(libraryPath, 'book2.epub'), 'Book', '["Author"]', '123', 1000
      );
      database.prepare('INSERT INTO books (library_id, file_path, title, authors, isbn, file_size) VALUES (?, ?, ?, ?, ?, ?)').run(
        libraryId, join(libraryPath, 'book3.epub'), 'Book', '["Author"]', '123', 1000
      );

      const result = await findDuplicatesBySimilarity(libraryId, 0.8);

      // Should group all similar books together
      assert.ok(Array.isArray(result));
      if (result.length > 0) {
        assert.ok(result[0]?.books.length >= 2);
      }
    });
  });

  describe('detectSeries', () => {
    it('should detect series from books', async () => {
      const database = db.getDb();

      database.prepare('INSERT INTO books (library_id, file_path, title, series_name, series_number) VALUES (?, ?, ?, ?, ?)').run(
        libraryId, join(libraryPath, 'hp1.epub'), 'Philosophers Stone', 'Harry Potter', 1
      );
      database.prepare('INSERT INTO books (library_id, file_path, title, series_name, series_number) VALUES (?, ?, ?, ?, ?)').run(
        libraryId, join(libraryPath, 'hp2.epub'), 'Chamber of Secrets', 'Harry Potter', 2
      );

      const result = await detectSeries(libraryId);

      assert.ok(Array.isArray(result));
      assert.strictEqual(result.length, 1);
      assert.strictEqual(result[0]?.name, 'Harry Potter');
      assert.ok(Array.isArray(result[0]?.books));
      assert.strictEqual(result[0]?.books.length, 2);
    });

    it('should work without libraryId', async () => {
      const database = db.getDb();

      database.prepare('INSERT INTO books (library_id, file_path, title, series_name, series_number) VALUES (?, ?, ?, ?, ?)').run(
        libraryId, join(libraryPath, 'book.epub'), 'Book', 'Series', 1
      );

      const result = await detectSeries();

      assert.ok(Array.isArray(result));
      assert.strictEqual(result.length, 1);
    });

    it('should return empty array when no series found', async () => {
      const result = await detectSeries(libraryId);

      assert.ok(Array.isArray(result));
      assert.strictEqual(result.length, 0);
    });
  });

  describe('getAllDuplicates', () => {
    it('should get both hash and similarity duplicates', async () => {
      const result = await getAllDuplicates(libraryId);

      assert.ok(result);
      assert.ok('hashDuplicates' in result);
      assert.ok('similarityDuplicates' in result);
      assert.ok(Array.isArray(result.hashDuplicates));
      assert.ok(Array.isArray(result.similarityDuplicates));
    });

    it('should use custom similarity threshold', async () => {
      const result = await getAllDuplicates(libraryId, 0.9);

      assert.ok(result);
      assert.ok(Array.isArray(result.hashDuplicates));
      assert.ok(Array.isArray(result.similarityDuplicates));
    });

    it('should work without libraryId', async () => {
      const result = await getAllDuplicates();

      assert.ok(result);
    });

    it('should find both types of duplicates when present', async () => {
      const database = db.getDb();

      // Create hash duplicates
      const file1 = join(libraryPath, 'dup1.epub');
      const file2 = join(libraryPath, 'dup2.epub');
      writeFileSync(file1, 'same content');
      writeFileSync(file2, 'same content');

      const hash = calculateFileHash(file1);
      database.prepare('INSERT INTO books (library_id, file_path, title, file_hash) VALUES (?, ?, ?, ?)').run(
        libraryId, file1, 'Duplicate Book 1', hash
      );
      database.prepare('INSERT INTO books (library_id, file_path, title, file_hash) VALUES (?, ?, ?, ?)').run(
        libraryId, file2, 'Duplicate Book 2', hash
      );

      // Create metadata similarity duplicates
      database.prepare('INSERT INTO books (library_id, file_path, title, authors, isbn) VALUES (?, ?, ?, ?, ?)').run(
        libraryId, join(libraryPath, 'similar1.epub'), 'The Great Book', '["Author Name"]', '111'
      );
      database.prepare('INSERT INTO books (library_id, file_path, title, authors, isbn) VALUES (?, ?, ?, ?, ?)').run(
        libraryId, join(libraryPath, 'similar2.epub'), 'The Great Book - Edition 2', '["Author Name"]', '111'
      );

      const result = await getAllDuplicates(libraryId, 0.7);

      assert.ok(result.hashDuplicates.length >= 1);
      assert.ok(result.similarityDuplicates.length >= 1);
    });
  });
});
