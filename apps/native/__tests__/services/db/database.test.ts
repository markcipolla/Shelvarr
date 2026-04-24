import { getDatabase, resetDatabase, DB_NAME } from '../../../src/services/db/database';
import { _resetAllDatabases } from '../../../__mocks__/expo-sqlite';

beforeEach(async () => {
  await resetDatabase();
  _resetAllDatabases();
});

describe('getDatabase / resetDatabase', () => {
  it('opens a fresh database on first call and initializes the schema', async () => {
    const db = await getDatabase();
    // Schema applied — comics table exists
    const rows = await db.getAllAsync<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'comics'"
    );
    expect(rows).toHaveLength(1);
  });

  it('returns the same database instance on subsequent calls', async () => {
    const a = await getDatabase();
    const b = await getDatabase();
    expect(a).toBe(b);
  });

  it('resetDatabase closes the connection and a fresh one can be opened', async () => {
    const first = await getDatabase();
    await resetDatabase();
    const second = await getDatabase();
    expect(second).not.toBe(first);
  });

  it('resetDatabase is a no-op when no db was ever opened', async () => {
    await resetDatabase();
    await expect(resetDatabase()).resolves.toBeUndefined();
  });

  it('exports a stable DB_NAME constant', () => {
    expect(typeof DB_NAME).toBe('string');
    expect(DB_NAME.length).toBeGreaterThan(0);
  });
});
