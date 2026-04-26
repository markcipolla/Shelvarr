import { getDatabase, resetDatabase } from '../../../src/services/db/database';
import { applyRows } from '../../../src/services/db/syncApply';
import { _resetAllDatabases } from '../../../__mocks__/expo-sqlite';

beforeEach(async () => {
  await resetDatabase();
  _resetAllDatabases();
});

describe('applyRows', () => {
  it('short-circuits on empty input', async () => {
    const result = await applyRows('comics', []);
    expect(result).toEqual({ upserted: 0, tombstoned: 0 });
  });

  it('inserts new rows', async () => {
    const result = await applyRows('comics', [
      {
        id: 1,
        title: 'Saga',
        year: 2012,
        deleted_at: null,
        updated_at: '2026-04-23T00:00:00.000Z',
      },
    ]);
    expect(result).toEqual({ upserted: 1, tombstoned: 0 });

    const db = await getDatabase();
    const row = await db.getFirstAsync<{ title: string; year: number }>(
      'SELECT title, year FROM comics WHERE id = 1'
    );
    expect(row).toEqual({ title: 'Saga', year: 2012 });
  });

  it('updates existing rows on id conflict', async () => {
    const db = await getDatabase();
    await db.runAsync(
      `INSERT INTO comics (id, title, year, updated_at) VALUES (1, 'Old', 2000, '2020-01-01T00:00:00.000Z')`
    );
    await applyRows('comics', [
      {
        id: 1,
        title: 'New',
        year: 2025,
        deleted_at: null,
        updated_at: '2026-04-23T00:00:00.000Z',
      },
    ]);
    const row = await db.getFirstAsync<{ title: string; year: number }>(
      'SELECT title, year FROM comics WHERE id = 1'
    );
    expect(row).toEqual({ title: 'New', year: 2025 });
  });

  it('tombstones rows when deleted_at is set', async () => {
    const db = await getDatabase();
    await db.runAsync(
      `INSERT INTO comics (id, title, updated_at) VALUES (1, 'Doomed', '2025-01-01T00:00:00.000Z')`
    );
    const result = await applyRows('comics', [
      {
        id: 1,
        deleted_at: '2026-04-23T00:00:00.000Z',
        updated_at: '2026-04-23T00:00:00.000Z',
      },
    ]);
    expect(result).toEqual({ upserted: 0, tombstoned: 1 });
    const row = await db.getFirstAsync<{ deleted_at: string }>(
      'SELECT deleted_at FROM comics WHERE id = 1'
    );
    expect(row?.deleted_at).toBe('2026-04-23T00:00:00.000Z');
  });

  it('mixes upserts and tombstones in a single batch', async () => {
    const db = await getDatabase();
    await db.runAsync(
      `INSERT INTO comics (id, title, updated_at) VALUES (2, 'Keep', '2025-01-01T00:00:00.000Z')`
    );
    const result = await applyRows('comics', [
      {
        id: 1,
        title: 'Fresh',
        deleted_at: null,
        updated_at: '2026-04-23T00:00:00.000Z',
      },
      {
        id: 2,
        deleted_at: '2026-04-23T00:00:00.000Z',
        updated_at: '2026-04-23T00:00:00.000Z',
      },
    ]);
    expect(result).toEqual({ upserted: 1, tombstoned: 1 });

    const newRow = await db.getFirstAsync<{ title: string }>(
      'SELECT title FROM comics WHERE id = 1'
    );
    expect(newRow?.title).toBe('Fresh');

    const tombstoned = await db.getFirstAsync<{ deleted_at: string }>(
      'SELECT deleted_at FROM comics WHERE id = 2'
    );
    expect(tombstoned?.deleted_at).toBe('2026-04-23T00:00:00.000Z');
  });

  it('rolls back the transaction on SQL error', async () => {
    const db = await getDatabase();
    let err: unknown = null;
    try {
      await applyRows('comics', [
        {
          id: 1,
          title: 'Good',
          deleted_at: null,
          updated_at: '2026-04-23T00:00:00.000Z',
        },
        {
          id: 2,
          title: null as unknown as string,
          deleted_at: null,
          updated_at: '2026-04-23T00:00:00.000Z',
        },
      ]);
    } catch (e) {
      err = e;
    }
    expect(err).toBeTruthy();

    const remaining = await db.getAllAsync('SELECT id FROM comics');
    expect(remaining).toEqual([]);
  });

  it('works for the books table too', async () => {
    const result = await applyRows('books', [
      {
        id: 1,
        library_id: 1,
        file_path: '/b.epub',
        title: 'B',
        deleted_at: null,
        updated_at: '2026-04-23T00:00:00.000Z',
      },
    ]);
    expect(result).toEqual({ upserted: 1, tombstoned: 0 });
  });
});
