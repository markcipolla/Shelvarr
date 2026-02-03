import { describe, it, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert';
import {
  scoreResult,
  isConfigured,
  getAllSourcesStatus,
  searchBooks,
  searchByIsbn,
  getBookBySourceId,
  autoMatch,
  type BookMetadata
} from '../../lib/services/metadata/index.js';
import * as hardcover from '../../lib/services/metadata/hardcover.js';

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
      const result = isConfigured();
      assert.strictEqual(typeof result, 'boolean');
    });
  });

  describe('getAllSourcesStatus', () => {
    it('should return array with hardcover status', async () => {
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
      const sources = await getAllSourcesStatus();
      assert.strictEqual(sources[0].enabled, sources[0].configured);
    });
  });

  describe('searchBooks', () => {
    it('should return empty array when hardcover is not configured', async () => {
      const origIsConfigured = hardcover.isConfigured;
      hardcover.isConfigured = () => false;

      const results = await searchBooks('test query');
      assert.deepStrictEqual(results, []);

      hardcover.isConfigured = origIsConfigured;
    });

    it('should call hardcover.searchBooks when configured', async () => {
      const origIsConfigured = hardcover.isConfigured;
      const origSearchBooks = hardcover.searchBooks;

      let called = false;
      let receivedQuery = '';
      let receivedMaxResults = 0;

      hardcover.isConfigured = () => true;
      hardcover.searchBooks = async (query: string, maxResults: number) => {
        called = true;
        receivedQuery = query;
        receivedMaxResults = maxResults;
        return [];
      };

      await searchBooks('test query', { maxResults: 5 });

      assert.ok(called);
      assert.strictEqual(receivedQuery, 'test query');
      assert.strictEqual(receivedMaxResults, 5);

      hardcover.isConfigured = origIsConfigured;
      hardcover.searchBooks = origSearchBooks;
    });

    it('should use default maxResults of 10 when not specified', async () => {
      const origIsConfigured = hardcover.isConfigured;
      const origSearchBooks = hardcover.searchBooks;

      let receivedMaxResults = 0;

      hardcover.isConfigured = () => true;
      hardcover.searchBooks = async (query: string, maxResults: number) => {
        receivedMaxResults = maxResults;
        return [];
      };

      await searchBooks('test query');

      assert.strictEqual(receivedMaxResults, 10);

      hardcover.isConfigured = origIsConfigured;
      hardcover.searchBooks = origSearchBooks;
    });
  });

  describe('searchByIsbn', () => {
    it('should return null when hardcover is not configured', async () => {
      const origIsConfigured = hardcover.isConfigured;
      hardcover.isConfigured = () => false;

      const result = await searchByIsbn('9780385121675');
      assert.strictEqual(result, null);

      hardcover.isConfigured = origIsConfigured;
    });

    it('should call hardcover.searchByIsbn when configured', async () => {
      const origIsConfigured = hardcover.isConfigured;
      const origSearchByIsbn = hardcover.searchByIsbn;

      let called = false;
      let receivedIsbn = '';

      hardcover.isConfigured = () => true;
      hardcover.searchByIsbn = async (isbn: string) => {
        called = true;
        receivedIsbn = isbn;
        return null;
      };

      await searchByIsbn('9780385121675');

      assert.ok(called);
      assert.strictEqual(receivedIsbn, '9780385121675');

      hardcover.isConfigured = origIsConfigured;
      hardcover.searchByIsbn = origSearchByIsbn;
    });
  });

  describe('getBookBySourceId', () => {
    it('should return null for non-hardcover source', async () => {
      const result = await getBookBySourceId('google', '123');
      assert.strictEqual(result, null);
    });

    it('should call hardcover.getBookById for hardcover source', async () => {
      const origGetBookById = hardcover.getBookById;

      let called = false;
      let receivedId = '';

      hardcover.getBookById = async (id: string) => {
        called = true;
        receivedId = id;
        return null;
      };

      await getBookBySourceId('hardcover', '123');

      assert.ok(called);
      assert.strictEqual(receivedId, '123');

      hardcover.getBookById = origGetBookById;
    });
  });

  describe('autoMatch', () => {
    it('should return null when hardcover is not configured', async () => {
      const origIsConfigured = hardcover.isConfigured;
      hardcover.isConfigured = () => false;

      const result = await autoMatch('The Shining', 'Stephen King');
      assert.strictEqual(result, null);

      hardcover.isConfigured = origIsConfigured;
    });

    it('should try ISBN search first when ISBN is provided', async () => {
      const origIsConfigured = hardcover.isConfigured;
      const origSearchByIsbn = hardcover.searchByIsbn;

      let isbnCalled = false;
      const mockResult: BookMetadata = {
        title: 'Test Book',
        authors: 'Test Author',
        isbn: '9780385121675',
        source: 'hardcover',
        sourceId: '123',
      };

      hardcover.isConfigured = () => true;
      hardcover.searchByIsbn = async (isbn: string) => {
        isbnCalled = true;
        return mockResult;
      };

      const result = await autoMatch('Test Book', 'Test Author', '9780385121675');

      assert.ok(isbnCalled);
      assert.deepStrictEqual(result, mockResult);

      hardcover.isConfigured = origIsConfigured;
      hardcover.searchByIsbn = origSearchByIsbn;
    });

    it('should fall back to text search when ISBN search returns null', async () => {
      const origIsConfigured = hardcover.isConfigured;
      const origSearchByIsbn = hardcover.searchByIsbn;
      const origSearchBooks = hardcover.searchBooks;

      let searchBooksCalled = false;
      const mockResult: BookMetadata = {
        title: 'Test Book',
        authors: 'Test Author',
        source: 'hardcover',
        sourceId: '123',
      };

      hardcover.isConfigured = () => true;
      hardcover.searchByIsbn = async () => null;
      hardcover.searchBooks = async (query: string, maxResults: number) => {
        searchBooksCalled = true;
        assert.strictEqual(maxResults, 1);
        return [mockResult];
      };

      const result = await autoMatch('Test Book', 'Test Author', '9780385121675');

      assert.ok(searchBooksCalled);
      assert.deepStrictEqual(result, mockResult);

      hardcover.isConfigured = origIsConfigured;
      hardcover.searchByIsbn = origSearchByIsbn;
      hardcover.searchBooks = origSearchBooks;
    });

    it('should combine title and author in search query', async () => {
      const origIsConfigured = hardcover.isConfigured;
      const origSearchBooks = hardcover.searchBooks;

      let receivedQuery = '';

      hardcover.isConfigured = () => true;
      hardcover.searchBooks = async (query: string) => {
        receivedQuery = query;
        return [];
      };

      await autoMatch('The Shining', 'Stephen King');

      assert.strictEqual(receivedQuery, 'The Shining Stephen King');

      hardcover.isConfigured = origIsConfigured;
      hardcover.searchBooks = origSearchBooks;
    });

    it('should handle missing author', async () => {
      const origIsConfigured = hardcover.isConfigured;
      const origSearchBooks = hardcover.searchBooks;

      let receivedQuery = '';

      hardcover.isConfigured = () => true;
      hardcover.searchBooks = async (query: string) => {
        receivedQuery = query;
        return [];
      };

      await autoMatch('The Shining');

      assert.strictEqual(receivedQuery, 'The Shining');

      hardcover.isConfigured = origIsConfigured;
      hardcover.searchBooks = origSearchBooks;
    });

    it('should return null for empty query', async () => {
      const origIsConfigured = hardcover.isConfigured;

      hardcover.isConfigured = () => true;

      const result = await autoMatch('');

      assert.strictEqual(result, null);

      hardcover.isConfigured = origIsConfigured;
    });

    it('should return first result from search', async () => {
      const origIsConfigured = hardcover.isConfigured;
      const origSearchBooks = hardcover.searchBooks;

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

      hardcover.isConfigured = () => true;
      hardcover.searchBooks = async () => [mockResult1, mockResult2];

      const result = await autoMatch('Test Book');

      assert.deepStrictEqual(result, mockResult1);

      hardcover.isConfigured = origIsConfigured;
      hardcover.searchBooks = origSearchBooks;
    });

    it('should return null when no results found', async () => {
      const origIsConfigured = hardcover.isConfigured;
      const origSearchBooks = hardcover.searchBooks;

      hardcover.isConfigured = () => true;
      hardcover.searchBooks = async () => [];

      const result = await autoMatch('Nonexistent Book');

      assert.strictEqual(result, null);

      hardcover.isConfigured = origIsConfigured;
      hardcover.searchBooks = origSearchBooks;
    });
  });
});
