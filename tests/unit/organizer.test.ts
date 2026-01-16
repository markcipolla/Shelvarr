import { describe, it } from 'node:test';
import assert from 'node:assert';

// Import only the pure functions that don't need database
import {
  sanitizePathComponent,
  applyTemplate,
  calculateMetadataSimilarity,
} from '../../src/services/organizer/index.js';

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
});
