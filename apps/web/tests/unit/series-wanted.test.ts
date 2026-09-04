/**
 * getCompleteSeriesInfo wanted-state tests
 *
 * The series page renders a Want button for every book it is missing. It has
 * to know which of those are already on the wanted list, otherwise the button
 * comes back unpressed on every load and pressing it does nothing.
 */

import { describe, it, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert';
import { mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

mock.module('next/cache', {
  namedExports: {
    revalidatePath: () => {},
    revalidateTag: () => {},
  },
});

const hardcoverBooks = [
  {
    id: 'hc-1',
    title: 'The Final Empire',
    authors: 'Brandon Sanderson',
    position: 1,
    coverUrl: 'https://example.com/1.jpg',
  },
  {
    id: 'hc-2',
    title: 'The Well of Ascension',
    authors: 'Brandon Sanderson',
    position: 2,
    coverUrl: 'https://example.com/2.jpg',
  },
];

mock.module('../../lib/services/metadata/hardcover.js', {
  namedExports: {
    isConfigured: () => true,
    searchSeries: async () => ({ id: 'series-1', name: 'Mistborn', books: hardcoverBooks }),
  },
});

const testDir = mkdtempSync(join(tmpdir(), 'shelvarr-series-wanted-'));
process.env['DATA_DIR'] = testDir;
process.env['DB_PATH'] = join(testDir, 'test.db');

const { initDatabase, closeDatabase, execute, addWantedBook } = await import('../../lib/db/index.js');
const { getCompleteSeriesInfo } = await import('../../lib/actions/series.js');

describe('getCompleteSeriesInfo wanted state', () => {
  beforeEach(() => {
    initDatabase();
    execute('DELETE FROM books', []);
    execute('DELETE FROM libraries', []);
    execute('DELETE FROM wanted_books', []);
    execute(`INSERT INTO libraries (id, name, path) VALUES (1, 'Test', '/test')`, []);
    execute(
      `INSERT INTO books (library_id, file_path, file_hash, title, series_name, series_number, authors)
       VALUES (1, '/test/final-empire.epub', 'hash1', 'The Final Empire', 'Mistborn', 1, '["Brandon Sanderson"]')`,
      []
    );
  });

  afterEach(() => {
    closeDatabase();
  });

  it('marks a missing book that is already on the wanted list', async () => {
    addWantedBook({ hardcover_id: 'hc-2', title: 'The Well of Ascension' });

    const info = await getCompleteSeriesInfo('Mistborn');

    assert.ok(info);
    const missing = info.books.find((b) => b.title === 'The Well of Ascension');
    assert.ok(missing);
    assert.strictEqual(missing.inLibrary, false);
    assert.strictEqual(missing.isWanted, true);
  });

  it('leaves a missing book that is not wanted unmarked', async () => {
    const info = await getCompleteSeriesInfo('Mistborn');

    assert.ok(info);
    const missing = info.books.find((b) => b.title === 'The Well of Ascension');
    assert.ok(missing);
    assert.strictEqual(missing.isWanted, false);
  });

  it('never marks an owned book as wanted', async () => {
    // Same title on the wanted list, but the book is in the library - the card
    // links to the book instead of offering a Want button.
    addWantedBook({ hardcover_id: 'hc-1', title: 'The Final Empire' });

    const info = await getCompleteSeriesInfo('Mistborn');

    assert.ok(info);
    const owned = info.books.find((b) => b.title === 'The Final Empire');
    assert.ok(owned);
    assert.strictEqual(owned.inLibrary, true);
    assert.strictEqual(owned.isWanted, false);
  });
});

process.on('exit', () => {
  rmSync(testDir, { recursive: true, force: true });
});
