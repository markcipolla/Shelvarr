/**
 * The Duplicates screen: what it offers to remove, and what happens when you
 * accept the offer.
 */

import { describe, it, beforeEach, afterEach, after, mock } from 'node:test';
import assert from 'node:assert';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

mock.module('next/cache', {
  namedExports: {
    revalidatePath: () => {},
    revalidateTag: () => {},
  },
});

const testDir = mkdtempSync(join(tmpdir(), 'shelvarr-duplicates-test-'));
const libraryPath = join(testDir, 'library');
mkdirSync(libraryPath, { recursive: true });

process.env['DATA_DIR'] = testDir;
process.env['DB_PATH'] = join(testDir, 'test.db');
process.env['LIBRARY_ROOT'] = testDir;

const { initDatabase, closeDatabase, execute } = await import('../../lib/db/index.js');

/**
 * Write a file and register it as a book.
 *
 * `file_hash` is left unset on purpose: the finder backfills it, which is the
 * path a library scanned before hashing existed would take.
 */
function seedBook(
  name: string,
  contents: string,
  overrides: { title?: string; metadataSource?: string | null } = {}
): void {
  const path = join(libraryPath, name);
  writeFileSync(path, contents);
  execute(
    `INSERT INTO books (library_id, file_path, file_size, extension, title, authors, metadata_source)
     VALUES (1, ?, ?, ?, ?, ?, ?)`,
    [
      path,
      contents.length,
      name.split('.').pop() ?? null,
      overrides.title ?? 'The Shining',
      JSON.stringify(['Stephen King']),
      overrides.metadataSource ?? null,
    ]
  );
}

describe('Duplicates', () => {
  beforeEach(() => {
    initDatabase();
    execute('DELETE FROM books', []);
    execute('DELETE FROM libraries', []);
    execute(`INSERT INTO libraries (id, name, path) VALUES (1, 'Test Library', ?)`, [libraryPath]);
  });

  afterEach(() => {
    closeDatabase();
  });

  after(() => {
    if (existsSync(testDir)) rmSync(testDir, { recursive: true, force: true });
  });

  it('groups byte-identical files and offers the matched copy first', async () => {
    seedBook('shining.epub', 'identical content', { metadataSource: null });
    seedBook('shining-copy.epub', 'identical content', { metadataSource: 'hardcover' });

    const { getDuplicatesAction } = await import('../../lib/actions/duplicates.js');
    const { books } = await getDuplicatesAction();

    const identical = books.filter((group) => group.kind === 'identical');
    assert.strictEqual(identical.length, 1);
    assert.strictEqual(identical[0]!.copies.length, 2);
    // The copy carrying metadata is the one pre-selected to keep.
    assert.strictEqual(identical[0]!.copies[0]!.matched, true);
    assert.ok(identical[0]!.copies[0]!.filePath.endsWith('shining-copy.epub'));
    // filePath and fileSize come off the row mapped, not cast.
    assert.strictEqual(identical[0]!.copies[0]!.fileSize, 'identical content'.length);

    // The same pair must not also be listed under the weaker "similar" heading.
    assert.strictEqual(books.filter((group) => group.kind === 'similar').length, 0);
  });

  it('keeps the chosen copy and removes the rest, leaving files alone by default', async () => {
    seedBook('a.epub', 'same bytes');
    seedBook('b.epub', 'same bytes');

    const { getDuplicatesAction, resolveBookDuplicateAction } = await import(
      '../../lib/actions/duplicates.js'
    );
    const { books } = await getDuplicatesAction();
    const group = books[0]!;
    const keep = group.copies[0]!;

    const result = await resolveBookDuplicateAction(
      keep.id,
      group.copies.map((copy) => copy.id)
    );

    assert.strictEqual(result.success, true);
    assert.strictEqual(result.removed, 1);
    assert.strictEqual(result.filesDeleted, 0);
    // Both files are still on disk; only the row went.
    assert.ok(group.copies.every((copy) => existsSync(copy.filePath)));

    const { books: after } = await getDuplicatesAction();
    assert.strictEqual(after.length, 0);
  });

  it('deletes the dropped copies from disk when asked', async () => {
    seedBook('a.epub', 'same bytes');
    seedBook('b.epub', 'same bytes');

    const { getDuplicatesAction, resolveBookDuplicateAction } = await import(
      '../../lib/actions/duplicates.js'
    );
    const { books } = await getDuplicatesAction();
    const group = books[0]!;
    const keep = group.copies[0]!;
    const dropped = group.copies.filter((copy) => copy.id !== keep.id);

    const result = await resolveBookDuplicateAction(
      keep.id,
      group.copies.map((copy) => copy.id),
      true
    );

    assert.strictEqual(result.success, true);
    assert.strictEqual(result.filesDeleted, 1);
    assert.ok(existsSync(keep.filePath));
    assert.ok(dropped.every((copy) => !existsSync(copy.filePath)));
  });

  it('refuses a resolve that would remove nothing', async () => {
    const { resolveBookDuplicateAction } = await import('../../lib/actions/duplicates.js');
    const result = await resolveBookDuplicateAction(7, [7]);

    assert.strictEqual(result.success, false);
    assert.strictEqual(result.removed, 0);
  });
});
