/**
 * Integration tests for metadata service index.ts
 * These tests use actual function implementations with mocked fetch
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';

// Store original fetch
let originalFetch: typeof global.fetch;

describe('Metadata Service Integration', () => {
  beforeEach(() => {
    originalFetch = global.fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    delete process.env.HARDCOVER_API_TOKEN;
  });

  describe('unconfigured behavior', () => {
    it('searchBooks should return empty array when not configured', async () => {
      delete process.env.HARDCOVER_API_TOKEN;
      const { searchBooks } = await import('../../lib/services/metadata/index.js');
      const results = await searchBooks('test');
      assert.deepStrictEqual(results, []);
    });

    it('searchByIsbn should return null when not configured', async () => {
      delete process.env.HARDCOVER_API_TOKEN;
      const { searchByIsbn } = await import('../../lib/services/metadata/index.js');
      const result = await searchByIsbn('9781234567890');
      assert.strictEqual(result, null);
    });

    it('getBookBySourceId should return null for non-hardcover source', async () => {
      const { getBookBySourceId } = await import('../../lib/services/metadata/index.js');
      const result = await getBookBySourceId('google', '123');
      assert.strictEqual(result, null);
    });

    it('autoMatch should return null when not configured', async () => {
      delete process.env.HARDCOVER_API_TOKEN;
      const { autoMatch } = await import('../../lib/services/metadata/index.js');
      const result = await autoMatch('Test Book', 'Test Author');
      assert.strictEqual(result, null);
    });

    it('autoMatch should return null for empty query', async () => {
      process.env.HARDCOVER_API_TOKEN = 'test-api-key';
      const { autoMatch } = await import('../../lib/services/metadata/index.js');
      const result = await autoMatch('');
      assert.strictEqual(result, null);
    });

    it('autoMatch should return null when no results found', async () => {
      process.env.HARDCOVER_API_TOKEN = 'test-api-key';
      const { autoMatch } = await import('../../lib/services/metadata/index.js');

      global.fetch = async (url: any, options: any) => {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            data: {
              search: {
                results: []
              }
            }
          })
        } as any;
      };

      const result = await autoMatch('Nonexistent Book');
      assert.strictEqual(result, null);
    });
  });

  describe('searchBooks with mock API', () => {
    it('should search and return results when configured', async () => {
      process.env.HARDCOVER_API_TOKEN = 'test-api-key';
      // Import after setting env var
      const { searchBooks } = await import('../../lib/services/metadata/index.js');

      global.fetch = async (url: any, options: any) => {
        const body = JSON.parse(options.body);

        if (body.query.includes('search(')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              data: {
                search: {
                  results: [{ id: 123 }]
                }
              }
            })
          } as any;
        }

        if (body.query.includes('books(')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              data: {
                books: [{
                  id: 123,
                  title: 'Test Book',
                  cached_contributors: JSON.stringify([
                    { author: { id: 1, name: 'Test Author' } }
                  ])
                }]
              }
            })
          } as any;
        }

        return { ok: false, status: 404 } as any;
      };

      const results = await searchBooks('test query', { maxResults: 5 });
      assert.strictEqual(results.length, 1);
      assert.strictEqual(results[0].title, 'Test Book');
    });
  });

  describe('searchByIsbn with mock API', () => {
    it('should search by ISBN and return result when configured', async () => {
      process.env.HARDCOVER_API_TOKEN = 'test-api-key';
      const { searchByIsbn } = await import('../../lib/services/metadata/index.js');

      global.fetch = async (url: any, options: any) => {
        const body = JSON.parse(options.body);

        if (body.query.includes('search(')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              data: {
                search: {
                  results: [{ id: 456 }]
                }
              }
            })
          } as any;
        }

        if (body.query.includes('books(')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              data: {
                books: [{
                  id: 456,
                  title: 'ISBN Book',
                  cached_contributors: '[]',
                  editions: [{ isbn_13: '9781234567890' }]
                }]
              }
            })
          } as any;
        }

        return { ok: false, status: 404 } as any;
      };

      const result = await searchByIsbn('9781234567890');
      assert.ok(result);
      assert.strictEqual(result.isbn, '9781234567890');
    });
  });

  describe('autoMatch with mock API', () => {
    it('should auto-match using ISBN first', async () => {
      process.env.HARDCOVER_API_TOKEN = 'test-api-key';
      const { autoMatch } = await import('../../lib/services/metadata/index.js');

      let isbnSearchCalled = false;

      global.fetch = async (url: any, options: any) => {
        const body = JSON.parse(options.body);

        if (body.query.includes('search(')) {
          isbnSearchCalled = true;
          return {
            ok: true,
            status: 200,
            json: async () => ({
              data: {
                search: {
                  results: [{ id: 789 }]
                }
              }
            })
          } as any;
        }

        if (body.query.includes('books(')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              data: {
                books: [{
                  id: 789,
                  title: 'Matched Book',
                  cached_contributors: '[]',
                  editions: [{ isbn_13: '9781111111111' }]
                }]
              }
            })
          } as any;
        }

        return { ok: false, status: 404 } as any;
      };

      const result = await autoMatch('Test', 'Author', '9781111111111');
      assert.ok(result);
      assert.ok(isbnSearchCalled);
    });

    it('should fall back to text search when ISBN fails', async () => {
      process.env.HARDCOVER_API_TOKEN = 'test-api-key';
      const { autoMatch } = await import('../../lib/services/metadata/index.js');

      let searchCallCount = 0;

      global.fetch = async (url: any, options: any) => {
        const body = JSON.parse(options.body);

        if (body.query.includes('search(')) {
          searchCallCount++;

          // First call (ISBN search) returns empty
          if (searchCallCount === 1) {
            return {
              ok: true,
              status: 200,
              json: async () => ({
                data: {
                  search: {
                    results: []
                  }
                }
              })
            } as any;
          }

          // Second call (text search) returns result
          return {
            ok: true,
            status: 200,
            json: async () => ({
              data: {
                search: {
                  results: [{ id: 999 }]
                }
              }
            })
          } as any;
        }

        if (body.query.includes('books(')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              data: {
                books: [{
                  id: 999,
                  title: 'Fallback Book',
                  cached_contributors: '[]'
                }]
              }
            })
          } as any;
        }

        return { ok: false, status: 404 } as any;
      };

      const result = await autoMatch('Test', 'Author', '9999999999999');
      assert.ok(result);
      assert.strictEqual(result.title, 'Fallback Book');
      assert.strictEqual(searchCallCount, 2);
    });

    it('should search with title and author combined', async () => {
      process.env.HARDCOVER_API_TOKEN = 'test-api-key';
      const { autoMatch } = await import('../../lib/services/metadata/index.js');

      let receivedQuery = '';

      global.fetch = async (url: any, options: any) => {
        const body = JSON.parse(options.body);

        if (body.query.includes('search(')) {
          receivedQuery = body.variables.query;
          return {
            ok: true,
            status: 200,
            json: async () => ({
              data: {
                search: {
                  results: [{ id: 111 }]
                }
              }
            })
          } as any;
        }

        if (body.query.includes('books(')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              data: {
                books: [{
                  id: 111,
                  title: 'Combined Search Book',
                  cached_contributors: '[]'
                }]
              }
            })
          } as any;
        }

        return { ok: false, status: 404 } as any;
      };

      const result = await autoMatch('The Shining', 'Stephen King');
      assert.ok(result);
      // Should search with combined query
      assert.ok(receivedQuery.includes('Shining') || receivedQuery.includes('Stephen'));
    });
  });

  describe('getBookBySourceId with mock API', () => {
    it('should get book by hardcover source ID', async () => {
      process.env.HARDCOVER_API_TOKEN = 'test-api-key';
      const { getBookBySourceId } = await import('../../lib/services/metadata/index.js');

      global.fetch = async (url: any, options: any) => {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            data: {
              books: [{
                id: 555,
                title: 'Source ID Book',
                cached_contributors: '[]'
              }]
            }
          })
        } as any;
      };

      const result = await getBookBySourceId('hardcover', '555');
      assert.ok(result);
      assert.strictEqual(result.title, 'Source ID Book');
    });
  });
});
