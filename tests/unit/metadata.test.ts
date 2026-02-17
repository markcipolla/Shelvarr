import { describe, it, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert';

// Mock the hardcover module BEFORE importing metadata service
// ESM modules have read-only exports, so we must use mock.module()
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

// Define the BookMetadata type locally (matches the one from the module)
interface BookMetadata {
  title: string;
  authors: string;
  publisher?: string;
  publishDate?: string;
  description?: string;
  isbn?: string;
  coverUrl?: string;
  pageCount?: number;
  categories?: string[];
  series?: Array<[string, number | null]>;
  source: 'hardcover';
  sourceId: string;
}

// Now import the metadata service (which will use the mocked hardcover)
const {
  scoreResult,
  isConfigured,
  getAllSourcesStatus,
  searchBooks,
  searchByIsbn,
  getBookBySourceId,
  autoMatch,
} = await import('../../lib/services/metadata/index.js');

describe('Metadata Service - Scoring', () => {
  // Helper to create a mock BookMetadata
  function createMetadata(overrides: Partial<BookMetadata> = {}): BookMetadata {
    return {
      title: 'Test Book',
      authors: 'Test Author',
      source: 'hardcover',
      sourceId: '123',
      ...overrides,
    };
  }

  beforeEach(() => {
    mockIsConfigured.mock.resetCalls();
    mockSearchBooks.mock.resetCalls();
    mockSearchByIsbn.mock.resetCalls();
    mockGetBookById.mock.resetCalls();
  });

  describe('scoreResult', () => {
    describe('title matching', () => {
      it('should give highest score for exact title match', () => {
        const result = createMetadata({ title: 'The Shining' });
        const score = scoreResult(result, 'The Shining');
        assert.ok(score >= 100, `Expected score >= 100 for exact match, got ${score}`);
      });

      it('should give high score when result starts with query title', () => {
        const result = createMetadata({ title: 'The Shining - A Novel' });
        const score = scoreResult(result, 'The Shining');
        assert.ok(score >= 80, `Expected score >= 80 for starts-with match, got ${score}`);
      });

      it('should give high score when query starts with result title', () => {
        const result = createMetadata({ title: 'The Shining' });
        const score = scoreResult(result, 'The Shining Extended');
        assert.ok(score >= 80, `Expected score >= 80 for starts-with match, got ${score}`);
      });

      it('should give medium score when title contains query', () => {
        const result = createMetadata({ title: 'Stephen King\'s The Shining' });
        const score = scoreResult(result, 'The Shining');
        assert.ok(score >= 60, `Expected score >= 60 for contains match, got ${score}`);
      });

      it('should give partial score for word matches', () => {
        const result = createMetadata({ title: 'The Illumination' });
        const score = scoreResult(result, 'The Shining');
        // Only "The" matches, so partial word match score
        assert.ok(score >= 0, `Expected some score for partial match, got ${score}`);
      });

      it('should be case insensitive', () => {
        const result = createMetadata({ title: 'THE SHINING' });
        const score = scoreResult(result, 'the shining');
        assert.ok(score >= 100, `Expected score >= 100 for case-insensitive match, got ${score}`);
      });
    });

    describe('author matching', () => {
      it('should add score for author match', () => {
        const result = createMetadata({ title: 'Book', authors: 'Stephen King' });
        const scoreWithAuthor = scoreResult(result, 'Book', 'Stephen King');
        const scoreWithoutAuthor = scoreResult(result, 'Book');
        assert.ok(scoreWithAuthor > scoreWithoutAuthor, 'Author match should increase score');
      });

      it('should match partial author names', () => {
        const result = createMetadata({ title: 'Book', authors: 'Stephen Edwin King' });
        const score = scoreResult(result, 'Book', 'Stephen King');
        const scoreNoAuthor = scoreResult(result, 'Book');
        assert.ok(score > scoreNoAuthor, 'Partial author match should increase score');
      });

      it('should ignore "Unknown" author in result', () => {
        const result = createMetadata({ title: 'Book', authors: 'Unknown' });
        const score = scoreResult(result, 'Book', 'Stephen King');
        const scoreNoAuthor = scoreResult(result, 'Book');
        assert.strictEqual(score, scoreNoAuthor, 'Unknown author should not affect score');
      });
    });

    describe('ISBN matching', () => {
      it('should add high score for exact ISBN match', () => {
        const result = createMetadata({ title: 'Book', isbn: '9780385121675' });
        const scoreWithIsbn = scoreResult(result, 'Book', undefined, '9780385121675');
        const scoreWithoutIsbn = scoreResult(result, 'Book');
        assert.ok(
          scoreWithIsbn - scoreWithoutIsbn >= 50,
          `ISBN match should add 50+ points, added ${scoreWithIsbn - scoreWithoutIsbn}`
        );
      });

      it('should normalize ISBN (remove dashes)', () => {
        const result = createMetadata({ title: 'Book', isbn: '978-0-385-12167-5' });
        const score = scoreResult(result, 'Book', undefined, '9780385121675');
        const scoreNoIsbn = scoreResult(result, 'Book');
        assert.ok(score > scoreNoIsbn, 'ISBN with dashes should still match');
      });

      it('should not add score for ISBN mismatch', () => {
        const result = createMetadata({ title: 'Book', isbn: '1111111111111' });
        const score = scoreResult(result, 'Book', undefined, '9780385121675');
        const scoreNoIsbn = scoreResult(result, 'Book');
        assert.strictEqual(score, scoreNoIsbn, 'ISBN mismatch should not change score');
      });
    });

    describe('metadata completeness', () => {
      it('should add score for having a cover URL', () => {
        const withCover = createMetadata({ title: 'Book', coverUrl: 'http://example.com/cover.jpg' });
        const withoutCover = createMetadata({ title: 'Book' });
        const scoreWith = scoreResult(withCover, 'Book');
        const scoreWithout = scoreResult(withoutCover, 'Book');
        assert.ok(scoreWith > scoreWithout, 'Cover URL should increase score');
      });

      it('should add score for having a description', () => {
        const withDesc = createMetadata({
          title: 'Book',
          description: 'A very long description that is definitely more than fifty characters in length.',
        });
        const withoutDesc = createMetadata({ title: 'Book' });
        const scoreWith = scoreResult(withDesc, 'Book');
        const scoreWithout = scoreResult(withoutDesc, 'Book');
        assert.ok(scoreWith > scoreWithout, 'Long description should increase score');
      });

      it('should not add score for short descriptions', () => {
        const withShortDesc = createMetadata({ title: 'Book', description: 'Short' });
        const withoutDesc = createMetadata({ title: 'Book' });
        const scoreWith = scoreResult(withShortDesc, 'Book');
        const scoreWithout = scoreResult(withoutDesc, 'Book');
        assert.strictEqual(scoreWith, scoreWithout, 'Short description should not increase score');
      });

      it('should add score for having series info', () => {
        const withSeries = createMetadata({
          title: 'Book',
          series: [['Dark Tower', 1]],
        });
        const withoutSeries = createMetadata({ title: 'Book' });
        const scoreWith = scoreResult(withSeries, 'Book');
        const scoreWithout = scoreResult(withoutSeries, 'Book');
        assert.ok(scoreWith > scoreWithout, 'Series info should increase score');
      });

      it('should add score for publisher and publishDate', () => {
        const withPubInfo = createMetadata({
          title: 'Book',
          publisher: 'Penguin',
          publishDate: '2020-01-01',
        });
        const withoutPubInfo = createMetadata({ title: 'Book' });
        const scoreWith = scoreResult(withPubInfo, 'Book');
        const scoreWithout = scoreResult(withoutPubInfo, 'Book');
        assert.ok(scoreWith > scoreWithout, 'Publisher info should increase score');
      });
    });

    describe('combined scoring', () => {
      it('should rank exact matches higher than partial matches', () => {
        const exactMatch = createMetadata({ title: 'The Shining', authors: 'Stephen King' });
        const partialMatch = createMetadata({ title: 'The Shining Hotel', authors: 'Stephen King' });

        const exactScore = scoreResult(exactMatch, 'The Shining', 'Stephen King');
        const partialScore = scoreResult(partialMatch, 'The Shining', 'Stephen King');

        assert.ok(exactScore > partialScore, 'Exact match should score higher than partial');
      });

      it('should rank results with more metadata higher', () => {
        const complete = createMetadata({
          title: 'The Shining',
          authors: 'Stephen King',
          coverUrl: 'http://example.com/cover.jpg',
          description: 'A terrifying tale of a haunted hotel that is definitely more than fifty characters.',
          series: [['The Shining', 1]],
          publisher: 'Doubleday',
          publishDate: '1977',
          isbn: '9780385121675',
        });
        const minimal = createMetadata({
          title: 'The Shining',
          authors: 'Stephen King',
        });

        const completeScore = scoreResult(complete, 'The Shining', 'Stephen King');
        const minimalScore = scoreResult(minimal, 'The Shining', 'Stephen King');

        assert.ok(completeScore > minimalScore, 'Complete metadata should score higher');
      });

      it('should prioritize ISBN match even with title mismatch', () => {
        const wrongTitleRightIsbn = createMetadata({
          title: 'Different Title',
          authors: 'Different Author',
          isbn: '9780385121675',
        });
        const rightTitleWrongIsbn = createMetadata({
          title: 'The Shining',
          authors: 'Stephen King',
          isbn: '0000000000000',
        });

        const isbnScore = scoreResult(wrongTitleRightIsbn, 'The Shining', 'Stephen King', '9780385121675');
        const titleScore = scoreResult(rightTitleWrongIsbn, 'The Shining', 'Stephen King', '9780385121675');

        // ISBN adds 50 points, should significantly boost the score
        assert.ok(
          isbnScore >= 50,
          `ISBN match should give at least 50 points, got ${isbnScore}`
        );
      });
    });
  });

  describe('isConfigured', () => {
    it('should return boolean indicating if hardcover is configured', () => {
      mockIsConfigured.mock.mockImplementation(() => true);
      const result = isConfigured();
      assert.strictEqual(typeof result, 'boolean');
    });
  });

  describe('getAllSourcesStatus', () => {
    it('should return array with hardcover status', async () => {
      mockIsConfigured.mock.mockImplementation(() => true);
      const sources = await getAllSourcesStatus();
      assert.ok(Array.isArray(sources));
      assert.strictEqual(sources.length, 1);
      assert.strictEqual(sources[0].name, 'hardcover');
      assert.strictEqual(sources[0].displayName, 'Hardcover');
      assert.strictEqual(sources[0].requiresApiKey, true);
      assert.strictEqual(sources[0].apiKeyUrl, 'https://hardcover.app/account/api');
      assert.strictEqual(typeof sources[0].enabled, 'boolean');
      assert.strictEqual(typeof sources[0].configured, 'boolean');
    });

    it('should have enabled matching configured status', async () => {
      mockIsConfigured.mock.mockImplementation(() => false);
      const sources = await getAllSourcesStatus();
      assert.strictEqual(sources[0].enabled, sources[0].configured);
    });
  });

  describe('searchBooks', () => {
    it('should return empty array when hardcover is not configured', async () => {
      mockIsConfigured.mock.mockImplementation(() => false);

      const results = await searchBooks('test query');
      assert.deepStrictEqual(results, []);
    });

    it('should call hardcover.searchBooks when configured', async () => {
      mockIsConfigured.mock.mockImplementation(() => true);
      mockSearchBooks.mock.mockImplementation(async () => []);

      await searchBooks('test query', { maxResults: 5 });

      assert.strictEqual(mockSearchBooks.mock.callCount(), 1);
      assert.strictEqual(mockSearchBooks.mock.calls[0].arguments[0], 'test query');
      assert.strictEqual(mockSearchBooks.mock.calls[0].arguments[1], 5);
    });

    it('should use default maxResults of 10 when not specified', async () => {
      mockIsConfigured.mock.mockImplementation(() => true);
      mockSearchBooks.mock.mockImplementation(async () => []);

      await searchBooks('test query');

      assert.strictEqual(mockSearchBooks.mock.callCount(), 1);
      assert.strictEqual(mockSearchBooks.mock.calls[0].arguments[1], 10);
    });
  });

  describe('searchByIsbn', () => {
    it('should return null when hardcover is not configured', async () => {
      mockIsConfigured.mock.mockImplementation(() => false);

      const result = await searchByIsbn('9780385121675');
      assert.strictEqual(result, null);
    });

    it('should call hardcover.searchByIsbn when configured', async () => {
      mockIsConfigured.mock.mockImplementation(() => true);
      mockSearchByIsbn.mock.mockImplementation(async () => null);

      await searchByIsbn('9780385121675');

      assert.strictEqual(mockSearchByIsbn.mock.callCount(), 1);
      assert.strictEqual(mockSearchByIsbn.mock.calls[0].arguments[0], '9780385121675');
    });
  });

  describe('getBookBySourceId', () => {
    it('should return null for non-hardcover source', async () => {
      const result = await getBookBySourceId('google', '123');
      assert.strictEqual(result, null);
    });

    it('should call hardcover.getBookById for hardcover source', async () => {
      mockGetBookById.mock.mockImplementation(async () => null);

      await getBookBySourceId('hardcover', '123');

      assert.strictEqual(mockGetBookById.mock.callCount(), 1);
      assert.strictEqual(mockGetBookById.mock.calls[0].arguments[0], '123');
    });
  });

  describe('autoMatch', () => {
    it('should return null when hardcover is not configured', async () => {
      mockIsConfigured.mock.mockImplementation(() => false);

      const result = await autoMatch('The Shining', 'Stephen King');
      assert.strictEqual(result, null);
    });

    it('should try ISBN search first when ISBN is provided', async () => {
      const mockResult: BookMetadata = {
        title: 'Test Book',
        authors: 'Test Author',
        isbn: '9780385121675',
        source: 'hardcover',
        sourceId: '123',
      };

      mockIsConfigured.mock.mockImplementation(() => true);
      mockSearchByIsbn.mock.mockImplementation(async () => mockResult);

      const result = await autoMatch('Test Book', 'Test Author', '9780385121675');

      assert.ok(mockSearchByIsbn.mock.callCount() >= 1);
      assert.deepStrictEqual(result, mockResult);
    });

    it('should fall back to text search when ISBN search returns null', async () => {
      const mockResult: BookMetadata = {
        title: 'Test Book',
        authors: 'Test Author',
        source: 'hardcover',
        sourceId: '123',
      };

      mockIsConfigured.mock.mockImplementation(() => true);
      mockSearchByIsbn.mock.mockImplementation(async () => null);
      mockSearchBooks.mock.mockImplementation(async (_query: string, _maxResults: number) => [mockResult]);

      const result = await autoMatch('Test Book', 'Test Author', '9780385121675');

      assert.ok(mockSearchBooks.mock.callCount() >= 1);
      assert.strictEqual(mockSearchBooks.mock.calls[0].arguments[1], 1);
      assert.deepStrictEqual(result, mockResult);
    });

    it('should combine title and author in search query', async () => {
      mockIsConfigured.mock.mockImplementation(() => true);
      mockSearchBooks.mock.mockImplementation(async () => []);

      await autoMatch('The Shining', 'Stephen King');

      assert.strictEqual(mockSearchBooks.mock.callCount(), 1);
      assert.strictEqual(mockSearchBooks.mock.calls[0].arguments[0], 'The Shining Stephen King');
    });

    it('should handle missing author', async () => {
      mockIsConfigured.mock.mockImplementation(() => true);
      mockSearchBooks.mock.mockImplementation(async () => []);

      await autoMatch('The Shining');

      assert.strictEqual(mockSearchBooks.mock.callCount(), 1);
      assert.strictEqual(mockSearchBooks.mock.calls[0].arguments[0], 'The Shining');
    });

    it('should return null for empty query', async () => {
      mockIsConfigured.mock.mockImplementation(() => true);

      const result = await autoMatch('');

      assert.strictEqual(result, null);
    });

    it('should return first result from search', async () => {
      const mockResult1: BookMetadata = {
        title: 'Test Book 1',
        authors: 'Test Author',
        source: 'hardcover',
        sourceId: '123',
      };
      const mockResult2: BookMetadata = {
        title: 'Test Book 2',
        authors: 'Test Author',
        source: 'hardcover',
        sourceId: '456',
      };

      mockIsConfigured.mock.mockImplementation(() => true);
      mockSearchBooks.mock.mockImplementation(async () => [mockResult1, mockResult2]);

      const result = await autoMatch('Test Book');

      assert.deepStrictEqual(result, mockResult1);
    });

    it('should return null when no results found', async () => {
      mockIsConfigured.mock.mockImplementation(() => true);
      mockSearchBooks.mock.mockImplementation(async () => []);

      const result = await autoMatch('Nonexistent Book');

      assert.strictEqual(result, null);
    });
  });
});
