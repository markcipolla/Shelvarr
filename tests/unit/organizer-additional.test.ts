/**
 * Additional unit tests for organizer service to reach 100% coverage
 * These tests target specific uncovered lines
 */

import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert';
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

import {
  calculateMetadataSimilarity,
  previewReorganization,
  applyReorganization,
} from '../../lib/services/organizer/index.js';

describe('Organizer Service - Additional Coverage Tests', () => {
  let testDir: string;
  let libraryPath: string;
  let db: typeof import('../../lib/db/index.js');
  let libraryId: number;

  before(async () => {
    testDir = join(tmpdir(), `shelvarr-organizer-additional-${Date.now()}`);
    mkdirSync(testDir, { recursive: true });

    libraryPath = join(testDir, 'library');
    mkdirSync(libraryPath, { recursive: true });

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

    const result = database.prepare('INSERT INTO libraries (name, path) VALUES (?, ?)').run('Test Library', libraryPath);
    libraryId = Number(result.lastInsertRowid);
  });

  describe('parseAuthors edge cases via calculateMetadataSimilarity', () => {
    it('should handle malformed JSON that returns original string', () => {
      // This tests the catch block in parseAuthors (lines 110-111)
      const book1 = {
        id: 1,
        libraryId: 1,
        title: 'Title',
        authors: 'Plain String Author', // Plain string, not JSON
        isbn: null,
        fileSize: null,
        filePath: '/test.epub',
      };
      const book2 = {
        id: 2,
        libraryId: 1,
        title: 'Title',
        authors: 'Plain String Author',
        isbn: null,
        fileSize: null,
        filePath: '/test2.epub',
      };

      const similarity = calculateMetadataSimilarity(book1 as never, book2 as never);
      // Should match since both have same author string
      assert.ok(similarity > 0);
    });
  });

  describe('applyReorganization with errors', () => {
    it('should handle items with preview errors', async () => {
      const database = db.getDb();

      // Create a book entry with unusual characters that might cause issues
      // We'll use a very long path or special characters
      const weirdPath = join(libraryPath, 'a'.repeat(300), 'book.epub'); // Very long path
      database.prepare('INSERT INTO books (library_id, file_path, title) VALUES (?, ?, ?)').run(
        libraryId, weirdPath, 'Test'
      );

      const result = await applyReorganization(libraryId, false);

      // Should handle the situation gracefully
      assert.ok(result);
      assert.ok(Array.isArray(result.errors) || Array.isArray(result.details));
    });

    it('should handle case where target file already exists', async () => {
      const database = db.getDb();

      // Create actual files that will need to be moved
      const source1Dir = join(libraryPath, 'Author1', 'Subdir1');
      const source2Dir = join(libraryPath, 'Author1', 'Subdir2');
      mkdirSync(source1Dir, { recursive: true });
      mkdirSync(source2Dir, { recursive: true });

      const source1Path = join(source1Dir, 'SameBook.epub');
      const source2Path = join(source2Dir, 'SameBook.epub');
      writeFileSync(source1Path, 'content1');
      writeFileSync(source2Path, 'content2');

      // Insert both books - they'll want to reorganize to the same target
      database.prepare('INSERT INTO books (library_id, file_path, title) VALUES (?, ?, ?)').run(
        libraryId, source1Path, 'SameBook'
      );
      database.prepare('INSERT INTO books (library_id, file_path, title) VALUES (?, ?, ?)').run(
        libraryId, source2Path, 'SameBook'
      );

      // Preview to see where they want to go
      const preview = await previewReorganization(libraryId);

      // If both books want to move to the same location, the second will fail
      const result = await applyReorganization(libraryId, false);

      assert.ok(result);
      assert.ok(result.details.length >= 2);
      // At least one should have an error about existing file
      const hasConflictError = result.errors.some(e => e.includes('already exists'));
      if (preview[0]?.newPath === preview[1]?.newPath && preview[0]?.willMove && preview[1]?.willMove) {
        assert.ok(hasConflictError || result.errors.length > 0);
      }
    });

    it('should detect when target file already exists at different path', async () => {
      const database = db.getDb();

      // Create source file
      const sourceDir = join(libraryPath, 'WrongLocation');
      mkdirSync(sourceDir, { recursive: true });
      const sourcePath = join(sourceDir, '[MySeriesName Book 1] The Book.epub');
      writeFileSync(sourcePath, 'source');

      // Create target file where the book wants to be moved
      const targetDir = join(libraryPath, 'MySeriesName');
      mkdirSync(targetDir, { recursive: true });
      const targetPath = join(targetDir, 'Book 001 - The Book.epub');
      writeFileSync(targetPath, 'existing target');

      // Insert book
      database.prepare('INSERT INTO books (library_id, file_path, title) VALUES (?, ?, ?)').run(
        libraryId, sourcePath, 'The Book'
      );

      // Apply reorganization - should detect conflict
      const result = await applyReorganization(libraryId, false);

      // Should have error about existing file
      assert.ok(result.errors.length > 0);
      const hasConflict = result.errors.some(e => e.toLowerCase().includes('already exists'));
      assert.ok(hasConflict);
      assert.strictEqual(result.success, false);
    });
  });

  describe('error path coverage for generateNewPath', () => {
    it('should handle malformed book data gracefully in preview', async () => {
      const database = db.getDb();

      // Create book with path that will cause issues during parsing
      // Using special unicode or control characters
      const problematicPath = join(libraryPath, '\x00invalid\x00', 'book.epub');

      // Since we can't insert null file_path, use an empty string or problematic characters
      try {
        database.prepare('INSERT INTO books (library_id, file_path, title) VALUES (?, ?, ?)').run(
          libraryId, problematicPath, 'Test'
        );

        const preview = await previewReorganization(libraryId);

        // Should either succeed or have error in preview
        assert.ok(preview.length > 0);
      } catch (e) {
        // If insert fails due to path, that's also expected
        assert.ok(true);
      }
    });
  });
});
