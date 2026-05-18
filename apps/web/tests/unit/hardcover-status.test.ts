import { describe, it, mock, beforeEach } from 'node:test';
import assert from 'node:assert';

// ============ Mock graphqlFetch responses ============

// We test the exported functions by mocking the global fetch
// since the module uses fetch internally via graphqlFetch

const mockFetchResponses: Array<{ data?: unknown; errors?: Array<{ message: string }> }> = [];

const originalFetch = globalThis.fetch;

function setupMockFetch() {
  globalThis.fetch = mock.fn(async () => {
    const response = mockFetchResponses.shift() ?? { data: null };
    return {
      ok: true,
      status: 200,
      json: async () => response,
    } as Response;
  }) as unknown as typeof fetch;
}

function teardownMockFetch() {
  globalThis.fetch = originalFetch;
}

// Mock the config and db modules before importing hardcover
mock.module('@/lib/config', {
  namedExports: {},
  defaultExport: {
    hardcoverToken: 'test-token-123',
    rateLimits: { hardcover: 600 },
    dbPath: '/tmp/test.db',
  },
});

mock.module('@/lib/db', {
  namedExports: {
    getSetting: () => null,
  },
});

const {
  searchUserBook,
  insertUserBook,
  updateUserBook,
  upsertReadingStatus,
  isConfigured,
} = await import('../../lib/services/metadata/hardcover.js');

describe('Hardcover Reading Status', () => {
  beforeEach(() => {
    mockFetchResponses.length = 0;
    setupMockFetch();
  });

  describe('isConfigured', () => {
    it('should return true when token is set', () => {
      assert.strictEqual(isConfigured(), true);
    });
  });

  describe('searchUserBook', () => {
    it('should return user book when found', async () => {
      mockFetchResponses.push({
        data: {
          user_books: [{
            id: 42,
            status_id: 2,
            book_id: 100,
            first_started_reading_date: '2025-01-01',
          }],
        },
      });

      const result = await searchUserBook('100');
      assert.ok(result);
      assert.strictEqual(result.id, 42);
      assert.strictEqual(result.status_id, 2);
      assert.strictEqual(result.book_id, 100);
    });

    it('should return null when no user book found', async () => {
      mockFetchResponses.push({
        data: { user_books: [] },
      });

      const result = await searchUserBook('999');
      assert.strictEqual(result, null);
    });

    it('should return null on API error', async () => {
      mockFetchResponses.push({
        errors: [{ message: 'Not found' }],
      });

      const result = await searchUserBook('100');
      assert.strictEqual(result, null);
    });
  });

  describe('insertUserBook', () => {
    it('should insert a new user book with reading status', async () => {
      mockFetchResponses.push({
        data: {
          insert_user_book: {
            id: 1,
            user_book: {
              id: 1,
              status_id: 2,
              book_id: 100,
              first_started_reading_date: '2025-06-01',
            },
          },
        },
      });

      const result = await insertUserBook('100', 2, '2025-06-01');
      assert.ok(result);
      assert.strictEqual(result.id, 1);
      assert.strictEqual(result.status_id, 2);
    });

    it('should insert with read status and finished date', async () => {
      mockFetchResponses.push({
        data: {
          insert_user_book: {
            id: 2,
            user_book: {
              id: 2,
              status_id: 3,
              book_id: 200,
              last_read_date: '2025-06-15',
            },
          },
        },
      });

      const result = await insertUserBook('200', 3, undefined, '2025-06-15');
      assert.ok(result);
      assert.strictEqual(result.status_id, 3);
    });

    it('should return null on failure', async () => {
      mockFetchResponses.push({ data: {} });

      const result = await insertUserBook('100', 2);
      assert.strictEqual(result, null);
    });
  });

  describe('updateUserBook', () => {
    it('should update status on existing entry', async () => {
      mockFetchResponses.push({
        data: {
          update_user_book: {
            id: 42,
            user_book: {
              id: 42,
              status_id: 3,
              book_id: 100,
              last_read_date: '2025-06-15',
            },
          },
        },
      });

      const result = await updateUserBook(42, 3, undefined, '2025-06-15');
      assert.ok(result);
      assert.strictEqual(result.status_id, 3);
    });

    it('should return null on failure', async () => {
      mockFetchResponses.push({ data: {} });

      const result = await updateUserBook(99, 2);
      assert.strictEqual(result, null);
    });
  });

  describe('upsertReadingStatus', () => {
    it('should insert when no existing entry', async () => {
      // First call: searchUserBook returns empty
      mockFetchResponses.push({ data: { user_books: [] } });
      // Second call: insertUserBook succeeds
      mockFetchResponses.push({
        data: {
          insert_user_book: {
            id: 1,
            user_book: {
              id: 1,
              status_id: 2,
              book_id: 100,
              first_started_reading_date: '2025-06-01',
            },
          },
        },
      });

      const result = await upsertReadingStatus('100', 2, '2025-06-01');
      assert.strictEqual(result.success, true);
      assert.ok(result.userBook);
      assert.strictEqual(result.userBook.status_id, 2);
    });

    it('should update when existing entry found', async () => {
      // First call: searchUserBook returns existing
      mockFetchResponses.push({
        data: {
          user_books: [{
            id: 42,
            status_id: 2,
            book_id: 100,
            first_started_reading_date: '2025-06-01',
          }],
        },
      });
      // Second call: updateUserBook succeeds
      mockFetchResponses.push({
        data: {
          update_user_book: {
            id: 42,
            user_book: {
              id: 42,
              status_id: 3,
              book_id: 100,
              first_started_reading_date: '2025-06-01',
              last_read_date: '2025-06-15',
            },
          },
        },
      });

      const result = await upsertReadingStatus('100', 3, undefined, '2025-06-15');
      assert.strictEqual(result.success, true);
      assert.ok(result.userBook);
      assert.strictEqual(result.userBook.status_id, 3);
    });

    it('should not downgrade from read to reading', async () => {
      // searchUserBook returns book already marked as "read" (3)
      mockFetchResponses.push({
        data: {
          user_books: [{
            id: 42,
            status_id: 3,
            book_id: 100,
            first_started_reading_date: '2025-06-01',
            last_read_date: '2025-06-10',
          }],
        },
      });

      // Should NOT make a second fetch call (no update needed)
      const result = await upsertReadingStatus('100', 2);
      assert.strictEqual(result.success, true);
      assert.ok(result.userBook);
      assert.strictEqual(result.userBook.status_id, 3); // stays as "read"
    });

    it('should return error when insert fails', async () => {
      mockFetchResponses.push({ data: { user_books: [] } });
      mockFetchResponses.push({ data: {} }); // insert returns no data

      const result = await upsertReadingStatus('100', 2);
      assert.strictEqual(result.success, false);
      assert.ok(result.error);
    });

    it('should handle fetch exceptions gracefully', async () => {
      teardownMockFetch();
      globalThis.fetch = mock.fn(async () => {
        throw new Error('Network error');
      }) as unknown as typeof fetch;

      const result = await upsertReadingStatus('100', 2);
      assert.strictEqual(result.success, false);
      assert.ok(result.error?.includes('Network error'));

      setupMockFetch();
    });
  });
});
