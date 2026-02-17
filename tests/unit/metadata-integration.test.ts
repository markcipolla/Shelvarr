/**
 * Integration tests for metadata service index.ts
 * These tests use actual function implementations with mocked fetch
 *
 * Note: We must mock the hardcover module to avoid importing @/lib/config
 * and @/lib/db which have path alias issues in the test runner.
 */

import { describe, it, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert';

// Mock the hardcover module to avoid @/ path alias resolution issues
// and to control fetch behavior directly
const mockIsConfigured = mock.fn(() => false);
const mockSearchBooks = mock.fn(async (_query: string, _maxResults: number) => [] as any[]);
const mockSearchByIsbn = mock.fn(async (_isbn: string) => null as any);
const mockGetBookById = mock.fn(async (_id: string) => null as any);

mock.module('../../lib/services/metadata/hardcover.js', {
  namedExports: {
    isConfigured: mockIsConfigured,
    searchBooks: mockSearchBooks,
    searchByIsbn: mockSearchByIsbn,
    getBookById: mockGetBookById,
    searchSeries: mock.fn(async () => null),
    getSeriesById: mock.fn(async () => null),
  },
});

const {
  searchBooks,
  searchByIsbn,
  getBookBySourceId,
  autoMatch,
} = await import('../../lib/services/metadata/index.js');

describe('Metadata Service Integration', { timeout: 30_000 }, () => {
  beforeEach(() => {
    mockIsConfigured.mock.resetCalls();
    mockSearchBooks.mock.resetCalls();
    mockSearchByIsbn.mock.resetCalls();
    mockGetBookById.mock.resetCalls();
  });

  describe('unconfigured behavior', () => {
    it('searchBooks should return empty array when not configured', async () => {
      mockIsConfigured.mock.mockImplementation(() => false);
      const results = await searchBooks('test');
      assert.deepStrictEqual(results, []);
    });

    it('searchByIsbn should return null when not configured', async () => {
      mockIsConfigured.mock.mockImplementation(() => false);
      const result = await searchByIsbn('9781234567890');
      assert.strictEqual(result, null);
    });

    it('getBookBySourceId should return null for non-hardcover source', async () => {
      const result = await getBookBySourceId('google', '123');
      assert.strictEqual(result, null);
    });

    it('autoMatch should return null when not configured', async () => {
      mockIsConfigured.mock.mockImplementation(() => false);
      const result = await autoMatch('Test Book', 'Test Author');
      assert.strictEqual(result, null);
    });

    it('autoMatch should return null for empty query', async () => {
      mockIsConfigured.mock.mockImplementation(() => true);
      const result = await autoMatch('');
      assert.strictEqual(result, null);
    });

    it('autoMatch should return null when no results found', async () => {
      mockIsConfigured.mock.mockImplementation(() => true);
      mockSearchBooks.mock.mockImplementation(async () => []);

      const result = await autoMatch('Nonexistent Book');
      assert.strictEqual(result, null);
    });
  });

  describe('searchBooks with mock API', () => {
    it('should search and return results when configured', async () => {
      const mockResult = {
        title: 'Test Book',
        authors: 'Test Author',
        source: 'hardcover' as const,
        sourceId: '123',
      };

      mockIsConfigured.mock.mockImplementation(() => true);
      mockSearchBooks.mock.mockImplementation(async () => [mockResult]);

      const results = await searchBooks('test query', { maxResults: 5 });
      assert.strictEqual(results.length, 1);
      assert.strictEqual(results[0].title, 'Test Book');
    });
  });

  describe('searchByIsbn with mock API', () => {
    it('should search by ISBN and return result when configured', async () => {
      const mockResult = {
        title: 'ISBN Book',
        authors: 'Unknown',
        isbn: '9781234567890',
        source: 'hardcover' as const,
        sourceId: '456',
      };

      mockIsConfigured.mock.mockImplementation(() => true);
      mockSearchByIsbn.mock.mockImplementation(async () => mockResult);

      const result = await searchByIsbn('9781234567890');
      assert.ok(result);
      assert.strictEqual(result.isbn, '9781234567890');
    });
  });

  describe('autoMatch with mock API', () => {
    it('should auto-match using ISBN first', async () => {
      const mockResult = {
        title: 'Matched Book',
        authors: 'Unknown',
        isbn: '9781111111111',
        source: 'hardcover' as const,
        sourceId: '789',
      };

      mockIsConfigured.mock.mockImplementation(() => true);
      mockSearchByIsbn.mock.mockImplementation(async () => mockResult);

      const result = await autoMatch('Test', 'Author', '9781111111111');
      assert.ok(result);
      assert.ok(mockSearchByIsbn.mock.callCount() >= 1);
    });

    it('should fall back to text search when ISBN fails', async () => {
      const mockResult = {
        title: 'Fallback Book',
        authors: 'Unknown',
        source: 'hardcover' as const,
        sourceId: '999',
      };

      mockIsConfigured.mock.mockImplementation(() => true);
      mockSearchByIsbn.mock.mockImplementation(async () => null);
      mockSearchBooks.mock.mockImplementation(async () => [mockResult]);

      const result = await autoMatch('Test', 'Author', '9999999999999');
      assert.ok(result);
      assert.strictEqual(result.title, 'Fallback Book');
      // searchByIsbn was called for the ISBN attempt, then searchBooks for the fallback
      assert.ok(mockSearchByIsbn.mock.callCount() >= 1);
      assert.ok(mockSearchBooks.mock.callCount() >= 1);
    });

    it('should search with title and author combined', async () => {
      const mockResult = {
        title: 'Combined Search Book',
        authors: 'Unknown',
        source: 'hardcover' as const,
        sourceId: '111',
      };

      mockIsConfigured.mock.mockImplementation(() => true);
      mockSearchBooks.mock.mockImplementation(async () => [mockResult]);

      const result = await autoMatch('The Shining', 'Stephen King');
      assert.ok(result);
      // Should search with combined query
      const calledQuery = mockSearchBooks.mock.calls[0].arguments[0];
      assert.ok(calledQuery.includes('Shining') || calledQuery.includes('Stephen'));
    });
  });

  describe('getBookBySourceId with mock API', () => {
    it('should get book by hardcover source ID', async () => {
      const mockResult = {
        title: 'Source ID Book',
        authors: 'Unknown',
        source: 'hardcover' as const,
        sourceId: '555',
      };

      mockGetBookById.mock.mockImplementation(async () => mockResult);

      const result = await getBookBySourceId('hardcover', '555');
      assert.ok(result);
      assert.strictEqual(result.title, 'Source ID Book');
    });
  });
});
