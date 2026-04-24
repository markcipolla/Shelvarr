import { resetDatabase } from '../../../src/services/db/database';
import {
  getLastSyncedAt,
  setLastSyncedAt,
  clearSyncState,
} from '../../../src/services/db/syncState';
import { _resetAllDatabases } from '../../../__mocks__/expo-sqlite';

beforeEach(async () => {
  await resetDatabase();
  _resetAllDatabases();
});

describe('syncState', () => {
  it('returns null for unknown entity', async () => {
    expect(await getLastSyncedAt('nonexistent')).toBeNull();
  });

  it('persists and retrieves a timestamp', async () => {
    await setLastSyncedAt('all', '2026-04-23T10:00:00.000Z');
    expect(await getLastSyncedAt('all')).toBe('2026-04-23T10:00:00.000Z');
  });

  it('overwrites existing timestamp on re-set', async () => {
    await setLastSyncedAt('all', '2026-04-22T10:00:00.000Z');
    await setLastSyncedAt('all', '2026-04-23T10:00:00.000Z');
    expect(await getLastSyncedAt('all')).toBe('2026-04-23T10:00:00.000Z');
  });

  it('keeps entities independent', async () => {
    await setLastSyncedAt('comics', '2026-04-01T00:00:00.000Z');
    await setLastSyncedAt('books', '2026-04-02T00:00:00.000Z');
    expect(await getLastSyncedAt('comics')).toBe('2026-04-01T00:00:00.000Z');
    expect(await getLastSyncedAt('books')).toBe('2026-04-02T00:00:00.000Z');
  });

  it('clearSyncState removes all entries', async () => {
    await setLastSyncedAt('all', '2026-04-23T00:00:00.000Z');
    await clearSyncState();
    expect(await getLastSyncedAt('all')).toBeNull();
  });
});
