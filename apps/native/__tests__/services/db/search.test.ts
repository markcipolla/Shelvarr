import { getDatabase, resetDatabase } from '../../../src/services/db/database';
import {
  buildFtsQuery,
  searchBooks,
  searchComics,
} from '../../../src/services/db/search';
import { _resetAllDatabases } from '../../../__mocks__/expo-sqlite';

beforeEach(async () => {
  await resetDatabase();
  _resetAllDatabases();
});

describe('buildFtsQuery', () => {
  it('returns empty for empty input', () => {
    expect(buildFtsQuery('')).toBe('');
    expect(buildFtsQuery('   ')).toBe('');
  });

  it('wraps tokens and adds prefix wildcards', () => {
    expect(buildFtsQuery('dark knight')).toBe('"dark"* "knight"*');
  });

  it('strips embedded quotes', () => {
    expect(buildFtsQuery('bob"s burgers')).toBe('"bobs"* "burgers"*');
  });
});

describe('searchBooks', () => {
  it('returns empty for empty input', async () => {
    expect(await searchBooks('')).toEqual([]);
  });

  it('finds books by title via the FTS trigger', async () => {
    const db = await getDatabase();
    await db.runAsync(`INSERT INTO books (id, title) VALUES (1, 'The Hobbit')`);
    await db.runAsync(`INSERT INTO books (id, title) VALUES (2, 'Jurassic Park')`);
    const results = await searchBooks('hobbit');
    expect(results.length).toBe(1);
    expect(results[0]?.title).toBe('The Hobbit');
  });

  it('finds books by author and series', async () => {
    const db = await getDatabase();
    await db.runAsync(
      `INSERT INTO books (id, title, authors, series_name) VALUES (1, 'B', '["Asimov"]', 'Foundation')`
    );
    expect((await searchBooks('asimov')).length).toBe(1);
    expect((await searchBooks('foundation')).length).toBe(1);
  });

  it('respects prefix wildcard', async () => {
    const db = await getDatabase();
    await db.runAsync(`INSERT INTO books (id, title) VALUES (1, 'Superman')`);
    expect((await searchBooks('sup')).length).toBe(1);
  });

  it('excludes soft-deleted books', async () => {
    const db = await getDatabase();
    await db.runAsync(
      `INSERT INTO books (id, title, deleted_at) VALUES (1, 'Ghost', '2026-04-23T00:00:00.000Z')`
    );
    expect((await searchBooks('ghost')).length).toBe(0);
  });

  it('respects the limit parameter', async () => {
    const db = await getDatabase();
    for (let i = 0; i < 5; i++) {
      await db.runAsync(`INSERT INTO books (id, title) VALUES (?, ?)`, [i + 1, `Match ${i}`]);
    }
    expect((await searchBooks('match', 2)).length).toBe(2);
  });

  it('reflects updates via triggers', async () => {
    const db = await getDatabase();
    await db.runAsync(`INSERT INTO books (id, title) VALUES (1, 'Old Title')`);
    await db.runAsync(`UPDATE books SET title = 'New Thing' WHERE id = 1`);
    expect((await searchBooks('old')).length).toBe(0);
    expect((await searchBooks('thing')).length).toBe(1);
  });

  it('removes rows from index on delete', async () => {
    const db = await getDatabase();
    await db.runAsync(`INSERT INTO books (id, title) VALUES (1, 'Vanishing')`);
    await db.runAsync(`DELETE FROM books WHERE id = 1`);
    expect((await searchBooks('vanishing')).length).toBe(0);
  });
});

describe('searchComics', () => {
  it('returns empty for empty input', async () => {
    expect(await searchComics('')).toEqual([]);
  });

  it('finds comics by title', async () => {
    const db = await getDatabase();
    await db.runAsync(`INSERT INTO comics (id, title) VALUES (1, 'Saga')`);
    const results = await searchComics('saga');
    expect(results.length).toBe(1);
    expect(results[0]?.title).toBe('Saga');
  });

  it('finds comics by publisher and description', async () => {
    const db = await getDatabase();
    await db.runAsync(
      `INSERT INTO comics (id, title, publisher, description) VALUES (1, 'X', 'Image', 'a space opera')`
    );
    expect((await searchComics('image')).length).toBe(1);
    expect((await searchComics('opera')).length).toBe(1);
  });

  it('excludes soft-deleted comics', async () => {
    const db = await getDatabase();
    await db.runAsync(
      `INSERT INTO comics (id, title, deleted_at) VALUES (1, 'Gone', '2026-04-23T00:00:00.000Z')`
    );
    expect((await searchComics('gone')).length).toBe(0);
  });

  it('respects the limit parameter', async () => {
    const db = await getDatabase();
    for (let i = 0; i < 5; i++) {
      await db.runAsync(`INSERT INTO comics (id, title) VALUES (?, ?)`, [i + 1, `Match ${i}`]);
    }
    expect((await searchComics('match', 2)).length).toBe(2);
  });
});
