const mockGet = jest.fn();
const mockGetLastSyncedAt = jest.fn();
const mockSetLastSyncedAt = jest.fn();
const mockApplyRows = jest.fn();

jest.mock('../../../src/services/api/client', () => ({
  getApiClient: () => ({ get: mockGet }),
}));

jest.mock('../../../src/services/db/syncState', () => ({
  getLastSyncedAt: (...args: unknown[]) => mockGetLastSyncedAt(...args),
  setLastSyncedAt: (...args: unknown[]) => mockSetLastSyncedAt(...args),
}));

jest.mock('../../../src/services/db/syncApply', () => ({
  applyRows: (...args: unknown[]) => mockApplyRows(...args),
}));

import { syncFromServer } from '../../../src/services/sync';

beforeEach(() => {
  jest.clearAllMocks();
  mockApplyRows.mockResolvedValue({ upserted: 0, tombstoned: 0 });
  mockSetLastSyncedAt.mockResolvedValue(undefined);
});

describe('syncFromServer', () => {
  it('calls /api/sync without since on first sync', async () => {
    mockGetLastSyncedAt.mockResolvedValue(null);
    mockGet.mockResolvedValue({
      data: { comics: [], comic_issues: [], books: [], now: '2026-04-23T00:00:00.000Z' },
    });

    await syncFromServer();

    expect(mockGet).toHaveBeenCalledWith('/api/sync', { params: {} });
  });

  it('forwards the stored cursor as the `since` param on subsequent syncs', async () => {
    mockGetLastSyncedAt.mockResolvedValue('2026-04-22T00:00:00.000Z');
    mockGet.mockResolvedValue({
      data: { comics: [], comic_issues: [], books: [], now: '2026-04-23T00:00:00.000Z' },
    });

    await syncFromServer();

    expect(mockGet).toHaveBeenCalledWith('/api/sync', {
      params: { since: '2026-04-22T00:00:00.000Z' },
    });
  });

  it('applies each entity array to the correct table', async () => {
    mockGetLastSyncedAt.mockResolvedValue(null);
    const comics = [{ id: 1, deleted_at: null }];
    const issues = [{ id: 10, deleted_at: null }];
    const books = [{ id: 100, deleted_at: null }];
    mockGet.mockResolvedValue({
      data: { comics, comic_issues: issues, books, now: '2026-04-23T00:00:00.000Z' },
    });

    await syncFromServer();

    expect(mockApplyRows).toHaveBeenNthCalledWith(1, 'comics', comics);
    expect(mockApplyRows).toHaveBeenNthCalledWith(2, 'comic_issues', issues);
    expect(mockApplyRows).toHaveBeenNthCalledWith(3, 'books', books);
  });

  it('advances the cursor to the server-provided `now` on success', async () => {
    mockGetLastSyncedAt.mockResolvedValue(null);
    mockGet.mockResolvedValue({
      data: { comics: [], comic_issues: [], books: [], now: '2026-04-23T12:00:00.000Z' },
    });

    await syncFromServer();

    expect(mockSetLastSyncedAt).toHaveBeenCalledWith('all', '2026-04-23T12:00:00.000Z');
  });

  it('treats missing entity arrays as empty', async () => {
    mockGetLastSyncedAt.mockResolvedValue(null);
    mockGet.mockResolvedValue({ data: { now: '2026-04-23T00:00:00.000Z' } });

    await syncFromServer();

    expect(mockApplyRows).toHaveBeenNthCalledWith(1, 'comics', []);
    expect(mockApplyRows).toHaveBeenNthCalledWith(2, 'comic_issues', []);
    expect(mockApplyRows).toHaveBeenNthCalledWith(3, 'books', []);
  });

  it('returns a summary with since, now, and per-table counts', async () => {
    mockGetLastSyncedAt.mockResolvedValue('2026-04-22T00:00:00.000Z');
    mockGet.mockResolvedValue({
      data: { comics: [], comic_issues: [], books: [], now: '2026-04-23T00:00:00.000Z' },
    });
    mockApplyRows
      .mockResolvedValueOnce({ upserted: 3, tombstoned: 1 })
      .mockResolvedValueOnce({ upserted: 10, tombstoned: 0 })
      .mockResolvedValueOnce({ upserted: 0, tombstoned: 2 });

    const result = await syncFromServer();

    expect(result).toEqual({
      since: '2026-04-22T00:00:00.000Z',
      now: '2026-04-23T00:00:00.000Z',
      comics: { upserted: 3, tombstoned: 1 },
      comic_issues: { upserted: 10, tombstoned: 0 },
      books: { upserted: 0, tombstoned: 2 },
    });
  });

  it('does not advance the cursor when the network call fails', async () => {
    mockGetLastSyncedAt.mockResolvedValue(null);
    mockGet.mockRejectedValue(new Error('offline'));

    await expect(syncFromServer()).rejects.toThrow('offline');
    expect(mockSetLastSyncedAt).not.toHaveBeenCalled();
    expect(mockApplyRows).not.toHaveBeenCalled();
  });

  it('does not advance the cursor when applyRows fails', async () => {
    mockGetLastSyncedAt.mockResolvedValue(null);
    mockGet.mockResolvedValue({
      data: {
        comics: [{ id: 1, deleted_at: null }],
        comic_issues: [],
        books: [],
        now: '2026-04-23T00:00:00.000Z',
      },
    });
    mockApplyRows.mockRejectedValueOnce(new Error('sql boom'));

    await expect(syncFromServer()).rejects.toThrow('sql boom');
    expect(mockSetLastSyncedAt).not.toHaveBeenCalled();
  });
});
