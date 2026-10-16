/**
 * `no-working-links` blocklist entries were written by a rule that could not
 * tell a dead article from an unreachable one: when nothing resolved, the
 * article was blocklisted permanently — including when GetComics was simply
 * rate-limiting the library sweep that was asking. The rule is fixed; these
 * rows are its output, so an upgrade clears them.
 *
 * Entries that are evidence of something — a link that really did prove
 * broken, or one added by hand — stay.
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

describe('comic blocklist migration', () => {
  let dir: string;
  let db: typeof import('../../lib/db/index.js');

  before(async () => {
    dir = mkdtempSync(join(tmpdir(), 'shelvarr-comic-blocklist-'));
    process.env['DATA_DIR'] = dir;
    process.env['DB_PATH'] = join(dir, 'test.db');

    db = await import('../../lib/db/index.js');
    db.initDatabase();

    db.addToComicBlocklist({
      downloadLink: 'https://getcomics.org/marvel/hulk-1/',
      webLink: 'https://getcomics.org/marvel/hulk-1/',
      reason: 'no-working-links',
    });
    db.addToComicBlocklist({
      downloadLink: 'https://getcomics.org/dls/really-dead',
      reason: 'link-broken',
    });
    db.addToComicBlocklist({
      downloadLink: 'https://getcomics.org/dls/junk-file',
      reason: 'added-by-user',
    });

    db.closeDatabase();
    db.initDatabase();
  });

  after(() => {
    db?.closeDatabase();
    rmSync(dir, { recursive: true, force: true });
  });

  it('clears the entries the old rule guessed at', () => {
    assert.ok(!db.comicBlocklistContains('https://getcomics.org/marvel/hulk-1/'));
  });

  it('keeps the entries that are evidence of something', () => {
    assert.ok(db.comicBlocklistContains('https://getcomics.org/dls/really-dead'));
    assert.ok(db.comicBlocklistContains('https://getcomics.org/dls/junk-file'));
  });
});
