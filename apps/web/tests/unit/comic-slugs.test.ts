/**
 * Comic volume slugs: how they are derived, how collisions are resolved, and
 * how a `/comics/<ref>` path segment maps back to a volume.
 */

import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert';
import type { ComicVolumeSummary } from '@shelvarr/types';

import { baseComicSlug, slugify, uniqueComicSlug } from '@shelvarr/db';

let db: typeof import('../../lib/db/index.js');

function makeVolume(overrides: Partial<ComicVolumeSummary> = {}): ComicVolumeSummary {
  return {
    id: 101,
    slug: '',
    comicvine_id: 5001,
    title: 'Saga',
    year: 2012,
    publisher: 'Image',
    volume_number: 1,
    description: '',
    monitored: true,
    monitor_new_issues: false,
    folder: '/comics/saga',
    issue_count: 60,
    issue_count_monitored: 60,
    issues_downloaded: 30,
    issues_downloaded_monitored: 30,
    total_size: 1048576,
    ...overrides,
  };
}

describe('slugify', () => {
  it('lowercases and hyphenates', () => {
    assert.strictEqual(slugify('The Amazing Spider-Man'), 'the-amazing-spider-man');
  });

  it('strips accents rather than dropping the letter', () => {
    assert.strictEqual(slugify('Café Racer'), 'cafe-racer');
  });

  it('keeps apostrophised words in one piece', () => {
    assert.strictEqual(slugify("Marvel's Runaways"), 'marvels-runaways');
    assert.strictEqual(slugify('Marvel’s Runaways'), 'marvels-runaways');
  });

  it('spells out an ampersand', () => {
    assert.strictEqual(slugify('Cloak & Dagger'), 'cloak-and-dagger');
  });

  it('collapses punctuation runs and trims the edges', () => {
    assert.strictEqual(slugify('  ...Batman: Year One!  '), 'batman-year-one');
  });

  it('returns an empty string when there is nothing sluggable', () => {
    assert.strictEqual(slugify('???'), '');
  });
});

describe('baseComicSlug', () => {
  it('appends the year, which is what tells volumes apart', () => {
    assert.strictEqual(baseComicSlug({ title: 'Saga', year: 2012 }), 'saga-2012');
  });

  it('omits the year when there is not one', () => {
    assert.strictEqual(baseComicSlug({ title: 'Saga', year: null }), 'saga');
  });

  it('falls back to a placeholder for an unsluggable title', () => {
    assert.strictEqual(baseComicSlug({ title: '???', year: null }), 'volume');
  });

  it('never produces a bare number, which would shadow a volume id', () => {
    assert.strictEqual(baseComicSlug({ title: '100', year: null }), 'volume-100');
    // With a year there is already a hyphen, so nothing to disambiguate.
    assert.strictEqual(baseComicSlug({ title: '100', year: 1985 }), '100-1985');
  });
});

describe('uniqueComicSlug', () => {
  it('takes the plain slug when nothing has claimed it', () => {
    assert.strictEqual(uniqueComicSlug({ title: 'Saga', year: 2012 }, () => false), 'saga-2012');
  });

  it('counts up past whatever is taken', () => {
    const taken = new Set(['saga-2012', 'saga-2012-2']);
    assert.strictEqual(
      uniqueComicSlug({ title: 'Saga', year: 2012 }, (slug) => taken.has(slug)),
      'saga-2012-3'
    );
  });

  it('never hands out a slug that would shadow a /comics page', () => {
    assert.strictEqual(uniqueComicSlug({ title: 'Add', year: null }, () => false), 'add-2');
    assert.strictEqual(uniqueComicSlug({ title: 'Downloads' }, () => false), 'downloads-2');
  });
});

describe('Comic slugs in the database', () => {
  before(async () => {
    process.env['DATA_DIR'] = '/tmp/shelvarr-comic-slug-test-' + Date.now();
    process.env['DB_PATH'] = process.env['DATA_DIR'] + '/test.db';

    const fs = await import('fs');
    fs.mkdirSync(process.env['DATA_DIR']!, { recursive: true });

    db = await import('../../lib/db/index.js');
    db.initDatabase();
  });

  after(async () => {
    if (db) db.closeDatabase();
    const fs = await import('fs');
    if (process.env['DATA_DIR']) {
      fs.rmSync(process.env['DATA_DIR'], { recursive: true, force: true });
    }
  });

  beforeEach(() => {
    if (!db) return;
    db.getDb().exec('DELETE FROM comic_issues; DELETE FROM comics;');
  });

  it('assigns a slug when a volume is stored', () => {
    db.upsertComicVolume(makeVolume({ id: 101, title: 'Saga', year: 2012 }));
    assert.strictEqual(db.getCachedComic(101)?.slug, 'saga-2012');
  });

  it('gives two volumes with the same title and year distinct slugs', () => {
    db.upsertComicVolumes([
      makeVolume({ id: 1, title: 'Saga', year: 2012 }),
      makeVolume({ id: 2, title: 'Saga', year: 2012 }),
    ]);
    assert.strictEqual(db.getComicSlug(1), 'saga-2012');
    assert.strictEqual(db.getComicSlug(2), 'saga-2012-2');
  });

  it('leaves an assigned slug alone when the title changes', () => {
    db.upsertComicVolume(makeVolume({ id: 101, title: 'Saga', year: 2012 }));
    db.upsertComicVolume(makeVolume({ id: 101, title: 'Saga Deluxe Edition', year: 2012 }));
    // Renaming a volume must not break links people have already saved.
    assert.strictEqual(db.getComicSlug(101), 'saga-2012');
  });

  it('resolves a slug back to its volume', () => {
    db.upsertComicVolume(makeVolume({ id: 101, title: 'Saga', year: 2012 }));
    assert.strictEqual(db.getComicIdBySlug('saga-2012'), 101);
    assert.strictEqual(db.getComicIdBySlug('nothing-here'), null);
  });

  it('does not resolve the slug of a soft-deleted volume', () => {
    db.upsertComicVolume(makeVolume({ id: 101, title: 'Saga', year: 2012 }));
    db.softDeleteComic(101);
    assert.strictEqual(db.getComicIdBySlug('saga-2012'), null);
  });

  it('backfills volumes that predate the slug column', () => {
    db.upsertComicVolume(makeVolume({ id: 101, title: 'Saga', year: 2012 }));
    db.upsertComicVolume(makeVolume({ id: 102, title: 'Paper Girls', year: 2015 }));
    db.getDb().exec('UPDATE comics SET slug = NULL');

    db.closeDatabase();
    db.initDatabase();

    assert.strictEqual(db.getComicSlug(101), 'saga-2012');
    assert.strictEqual(db.getComicSlug(102), 'paper-girls-2015');
  });

  it('resolves a path segment to a volume, by slug or by id', async () => {
    const { resolveComicRef } = await import('../../lib/actions/comics.js');
    db.upsertComicVolume(makeVolume({ id: 101, title: 'Saga', year: 2012 }));

    assert.deepStrictEqual(await resolveComicRef('saga-2012'), { id: 101, slug: 'saga-2012' });
    // A bare id resolves too, but reports the canonical slug so the page can
    // redirect old links onto it.
    assert.deepStrictEqual(await resolveComicRef('101'), { id: 101, slug: 'saga-2012' });
    assert.strictEqual(await resolveComicRef('nope'), null);
    assert.strictEqual(await resolveComicRef('999'), null);
  });

  it('looks up a batch of slugs by id', () => {
    db.upsertComicVolumes([
      makeVolume({ id: 1, title: 'Saga', year: 2012 }),
      makeVolume({ id: 2, title: 'Paper Girls', year: 2015 }),
    ]);
    const slugs = db.getComicSlugs([1, 2, 3]);
    assert.strictEqual(slugs.get(1), 'saga-2012');
    assert.strictEqual(slugs.get(2), 'paper-girls-2015');
    assert.strictEqual(slugs.get(3), undefined);
  });
});
