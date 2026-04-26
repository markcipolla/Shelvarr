const mockGetLastSyncedAt = jest.fn();
const mockSyncFromServer = jest.fn();

jest.mock('../../../src/services/db/syncState', () => ({
  getLastSyncedAt: (...args: unknown[]) => mockGetLastSyncedAt(...args),
}));

jest.mock('../../../src/services/sync', () => ({
  syncFromServer: (...args: unknown[]) => mockSyncFromServer(...args),
}));

import { maybeSync } from '../../../src/services/sync/refresh';

beforeEach(() => {
  jest.clearAllMocks();
});

describe('maybeSync', () => {
  it('runs sync when no cursor exists', async () => {
    mockGetLastSyncedAt.mockResolvedValue(null);
    mockSyncFromServer.mockResolvedValue({
      since: null,
      now: '2026-04-23T00:00:00.000Z',
      comics: { upserted: 1, tombstoned: 0 },
      comic_issues: { upserted: 0, tombstoned: 0 },
      books: { upserted: 0, tombstoned: 0 },
    });

    const result = await maybeSync();

    expect(result.ran).toBe(true);
    expect(mockSyncFromServer).toHaveBeenCalled();
  });

  it('skips sync when the last run is within the min interval', async () => {
    const fiveMinAgo = new Date(Date.now() - 5 * 60_000).toISOString();
    mockGetLastSyncedAt.mockResolvedValue(fiveMinAgo);

    const result = await maybeSync(30);

    expect(result.ran).toBe(false);
    expect(result.skippedBecause).toBe('recent');
    expect(result.ageMinutes).toBeGreaterThan(0);
    expect(mockSyncFromServer).not.toHaveBeenCalled();
  });

  it('runs sync when the last run is older than the min interval', async () => {
    const oneHourAgo = new Date(Date.now() - 60 * 60_000).toISOString();
    mockGetLastSyncedAt.mockResolvedValue(oneHourAgo);
    mockSyncFromServer.mockResolvedValue({
      since: oneHourAgo,
      now: '2026-04-23T00:00:00.000Z',
      comics: { upserted: 0, tombstoned: 0 },
      comic_issues: { upserted: 0, tombstoned: 0 },
      books: { upserted: 0, tombstoned: 0 },
    });

    const result = await maybeSync(30);

    expect(result.ran).toBe(true);
    expect(mockSyncFromServer).toHaveBeenCalled();
  });

  it('returns offline result when sync throws', async () => {
    mockGetLastSyncedAt.mockResolvedValue(null);
    mockSyncFromServer.mockRejectedValue(new Error('network down'));

    const result = await maybeSync();

    expect(result.ran).toBe(false);
    expect(result.skippedBecause).toBe('offline');
    expect(result.error).toBe('network down');
  });

  it('uses a generic error for non-Error rejections', async () => {
    mockGetLastSyncedAt.mockResolvedValue(null);
    mockSyncFromServer.mockRejectedValue('weird');
    const result = await maybeSync();
    expect(result.error).toBe('weird');
  });

  it('runs when the custom interval has elapsed', async () => {
    const threeMinAgo = new Date(Date.now() - 3 * 60_000).toISOString();
    mockGetLastSyncedAt.mockResolvedValue(threeMinAgo);
    mockSyncFromServer.mockResolvedValue({
      since: threeMinAgo,
      now: '2026-04-23T00:00:00.000Z',
      comics: { upserted: 0, tombstoned: 0 },
      comic_issues: { upserted: 0, tombstoned: 0 },
      books: { upserted: 0, tombstoned: 0 },
    });

    const result = await maybeSync(1);
    expect(result.ran).toBe(true);
  });

  it('skips when interval is very large', async () => {
    const oneMinAgo = new Date(Date.now() - 60_000).toISOString();
    mockGetLastSyncedAt.mockResolvedValue(oneMinAgo);

    const result = await maybeSync(120);

    expect(result.ran).toBe(false);
    expect(result.skippedBecause).toBe('recent');
  });
});
