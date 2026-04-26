/**
 * Tests for the server-side comic refresh module.
 */

import { describe, it, before, after, beforeEach, mock } from 'node:test';
import assert from 'node:assert';

type VolumeStub = { id: number; title: string; [key: string]: unknown };

let configured = true;
const getVolumesMock = mock.fn<() => Promise<VolumeStub[]>>(async () => []);
const getVolumeMock = mock.fn<(id: number) => Promise<VolumeStub & { issues: unknown[] }>>(
  async (id) => ({ id, title: `V${id}`, issues: [] })
);

mock.module('@/lib/services/kapowarr', {
  namedExports: {
    configureKapowarrFromDb: async () => configured,
    kapowarrClient: {
      getVolumes: () => getVolumesMock(),
      getVolume: (id: number) => getVolumeMock(id),
    },
  },
});

let db: typeof import('../../lib/db/index.js');
let refreshStaleComics: typeof import('../../lib/refresh/comics.js').refreshStaleComics;

describe('refreshStaleComics', () => {
  before(async () => {
    process.env['DATA_DIR'] = '/tmp/shelvarr-refresh-test-' + Date.now();
    process.env['DB_PATH'] = process.env['DATA_DIR'] + '/test.db';
    const fs = await import('fs');
    fs.mkdirSync(process.env['DATA_DIR']!, { recursive: true });
    db = await import('../../lib/db/index.js');
    db.initDatabase();
    ({ refreshStaleComics } = await import('../../lib/refresh/comics.js'));
  });

  after(async () => {
    if (db) db.closeDatabase();
    const fs = await import('fs');
    if (process.env['DATA_DIR']) {
      fs.rmSync(process.env['DATA_DIR'], { recursive: true, force: true });
    }
  });

  beforeEach(() => {
    const database = db.getDb();
    database.exec(`DELETE FROM comic_issues; DELETE FROM comics;`);
    configured = true;
    getVolumesMock.mock.resetCalls();
    getVolumeMock.mock.resetCalls();
    getVolumesMock.mock.mockImplementation(async () => []);
    getVolumeMock.mock.mockImplementation(async (id: number) => ({
      id,
      title: `V${id}`,
      issues: [],
    }));
  });

  it('short-circuits when Kapowarr is not configured', async () => {
    configured = false;
    const summary = await refreshStaleComics();
    assert.strictEqual(summary.configured, false);
    assert.strictEqual(getVolumesMock.mock.callCount(), 0);
  });

  it('upserts fetched volumes into the cache', async () => {
    getVolumesMock.mock.mockImplementation(async () => [
      { id: 1, title: 'One' },
      { id: 2, title: 'Two' },
    ]);
    const summary = await refreshStaleComics({ maxDetailsPerRun: 0 });
    assert.strictEqual(summary.refreshedVolumes, 2);
    const rows = db.query<{ id: number; title: string }>(
      'SELECT id, title FROM comics ORDER BY id'
    );
    assert.deepStrictEqual(rows, [
      { id: 1, title: 'One' },
      { id: 2, title: 'Two' },
    ]);
  });

  it('soft-deletes local comics absent from the remote list', async () => {
    db.execute(`INSERT INTO comics (id, title) VALUES (100, 'Ghost')`);
    getVolumesMock.mock.mockImplementation(async () => [{ id: 1, title: 'New' }]);
    const summary = await refreshStaleComics();
    assert.strictEqual(summary.tombstoned, 1);
    const ghost = db.queryOne<{ deleted_at: string | null }>(
      'SELECT deleted_at FROM comics WHERE id = 100'
    );
    assert.ok(ghost?.deleted_at);
  });

  it('does not tombstone rows that are already tombstoned', async () => {
    db.execute(
      `INSERT INTO comics (id, title, deleted_at) VALUES (100, 'Ghost', '2024-01-01T00:00:00.000Z')`
    );
    getVolumesMock.mock.mockImplementation(async () => []);
    const summary = await refreshStaleComics();
    assert.strictEqual(summary.tombstoned, 0);
  });

  it('refreshes stale detail records', async () => {
    const old = new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString();
    db.execute(
      `INSERT INTO comics (id, title, detail_cached_at) VALUES (1, 'A', ?)`,
      [old]
    );
    getVolumesMock.mock.mockImplementation(async () => [{ id: 1, title: 'A' }]);
    const summary = await refreshStaleComics({ detailMaxAgeMinutes: 60 });
    assert.strictEqual(summary.refreshedDetails, 1);
    assert.strictEqual(getVolumeMock.mock.callCount(), 1);
    assert.strictEqual(getVolumeMock.mock.calls[0].arguments[0], 1);
  });

  it('skips details refreshed within the freshness window', async () => {
    const recent = new Date(Date.now() - 1000 * 60 * 10).toISOString();
    db.execute(
      `INSERT INTO comics (id, title, detail_cached_at) VALUES (1, 'A', ?)`,
      [recent]
    );
    getVolumesMock.mock.mockImplementation(async () => [{ id: 1, title: 'A' }]);
    const summary = await refreshStaleComics({ detailMaxAgeMinutes: 60 });
    assert.strictEqual(summary.refreshedDetails, 0);
    assert.strictEqual(getVolumeMock.mock.callCount(), 0);
  });

  it('refreshes details that have never been cached', async () => {
    getVolumesMock.mock.mockImplementation(async () => [{ id: 42, title: 'New' }]);
    const summary = await refreshStaleComics();
    assert.strictEqual(summary.refreshedDetails, 1);
  });

  it('caps the number of details per run', async () => {
    getVolumesMock.mock.mockImplementation(async () =>
      Array.from({ length: 10 }, (_, i) => ({ id: i + 1, title: `V${i + 1}` }))
    );
    const summary = await refreshStaleComics({ maxDetailsPerRun: 3 });
    assert.strictEqual(summary.refreshedDetails, 3);
    assert.strictEqual(getVolumeMock.mock.callCount(), 3);
  });

  it('captures errors from a failing volume list fetch', async () => {
    getVolumesMock.mock.mockImplementation(async () => {
      throw new Error('kapowarr down');
    });
    const summary = await refreshStaleComics();
    assert.strictEqual(summary.refreshedVolumes, 0);
    assert.match(summary.errors[0]!, /volumes list.*kapowarr down/);
  });

  it('captures per-detail errors and continues', async () => {
    getVolumesMock.mock.mockImplementation(async () => [
      { id: 1, title: 'Good' },
      { id: 2, title: 'Bad' },
    ]);
    getVolumeMock.mock.mockImplementation(async (id: number) => {
      if (id === 2) throw new Error('detail exploded');
      return { id, title: `V${id}`, issues: [] };
    });
    const summary = await refreshStaleComics();
    assert.strictEqual(summary.refreshedDetails, 1);
    assert.strictEqual(summary.errors.length, 1);
    assert.match(summary.errors[0]!, /detail 2.*exploded/);
  });
});
