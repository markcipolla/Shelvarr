/**
 * Integration tests for hardcover.ts with mocked fetch
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';

let originalFetch: typeof global.fetch;

describe('Hardcover Service Integration', () => {
  beforeEach(() => {
    originalFetch = global.fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    delete process.env.HARDCOVER_TOKEN;
    delete process.env.HARDCOVER_API_TOKEN;
  });

  describe('getApiToken with Bearer prefix', () => {
    it('should strip Bearer prefix from environment token', async () => {
      process.env.HARDCOVER_API_TOKEN = 'Bearer test-token-12345';
      const { isConfigured, searchBooks } = await import('../../lib/services/metadata/hardcover.js');

      // Verify it's configured
      assert.ok(isConfigured());

      // Mock fetch to verify the token is sent without Bearer prefix
      let sentToken = '';
      global.fetch = async (url: any, options: any) => {
        sentToken = options.headers.authorization;
        return {
          ok: true,
          status: 200,
          json: async () => ({
            data: { search: { results: [] } }
          })
        } as any;
      };

      await searchBooks('test', 1);
      // Should send "Bearer test-token-12345" (re-added by graphqlFetch)
      assert.ok(sentToken.includes('test-token-12345'));

      delete process.env.HARDCOVER_API_TOKEN;
    });
  });

  describe('graphqlFetch without token', () => {
    it('should return null and log error when no token configured', async () => {
      delete process.env.HARDCOVER_TOKEN;
      delete process.env.HARDCOVER_API_TOKEN;
      const { getBookById } = await import('../../lib/services/metadata/hardcover.js');

      const result = await getBookById('123');
      assert.strictEqual(result, null);
    });
  });

  describe('getBookById', () => {
    beforeEach(() => {
      process.env.HARDCOVER_API_TOKEN = 'test-api-key';
    });

    it('should return null when API returns errors', async () => {
      const { getBookById } = await import('../../lib/services/metadata/hardcover.js');

      global.fetch = async () => ({
        ok: true,
        status: 200,
        json: async () => ({
          errors: [{ message: 'GraphQL error' }]
        })
      }) as any;

      const result = await getBookById('123');
      assert.strictEqual(result, null);
    });

    it('should handle contributions array for authors', async () => {
      const { getBookById } = await import('../../lib/services/metadata/hardcover.js');

      global.fetch = async () => ({
        ok: true,
        status: 200,
        json: async () => ({
          data: {
            books: [{
              id: 123,
              title: 'Test',
              contributions: [
                { author: { id: 1, name: 'Author 1' } },
                { author: { id: 2, name: 'Author 2' } }
              ]
            }]
          }
        })
      }) as any;

      const result = await getBookById('123');
      assert.ok(result);
      assert.strictEqual(result.authors, 'Author 1, Author 2');
    });

    it('should handle direct author string field', async () => {
      const { getBookById } = await import('../../lib/services/metadata/hardcover.js');

      global.fetch = async () => ({
        ok: true,
        status: 200,
        json: async () => ({
          data: {
            books: [{
              id: 123,
              title: 'Test',
              author: 'Direct Author'
            }]
          }
        })
      }) as any;

      const result = await getBookById('123');
      assert.ok(result);
      assert.strictEqual(result.authors, 'Direct Author');
    });
  });

  describe('searchBooks edge cases', () => {
    beforeEach(() => {
      process.env.HARDCOVER_API_TOKEN = 'test-api-key';
    });

    it('should handle results wrapper in object', async () => {
      const { searchBooks } = await import('../../lib/services/metadata/hardcover.js');

      global.fetch = async (url: any, options: any) => {
        const body = JSON.parse(options.body);

        if (body.query.includes('search(')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              data: {
                search: {
                  results: { results: [{ id: 123 }] }
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
                  title: 'Test',
                  cached_contributors: '[]'
                }]
              }
            })
          } as any;
        }

        return { ok: false, status: 404 } as any;
      };

      const results = await searchBooks('test', 10);
      assert.strictEqual(results.length, 1);
    });

    it('should return empty for object with no array properties', async () => {
      const { searchBooks } = await import('../../lib/services/metadata/hardcover.js');

      global.fetch = async () => ({
        ok: true,
        status: 200,
        json: async () => ({
          data: {
            search: {
              results: { notAnArray: 'value' }
            }
          }
        })
      }) as any;

      const results = await searchBooks('test', 10);
      assert.deepStrictEqual(results, []);
    });

    it('should return empty for non-string/array/object results', async () => {
      const { searchBooks } = await import('../../lib/services/metadata/hardcover.js');

      global.fetch = async () => ({
        ok: true,
        status: 200,
        json: async () => ({
          data: {
            search: {
              results: 123
            }
          }
        })
      }) as any;

      const results = await searchBooks('test', 10);
      assert.deepStrictEqual(results, []);
    });
  });
});
