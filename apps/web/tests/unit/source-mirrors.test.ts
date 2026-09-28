/**
 * Source mirrors (E1-1)
 *
 * The shadow libraries rotate domains, and their mirror lists used to be
 * hardcoded constants in four places — so following a rotation meant a code
 * change and a Docker pull. They live in `source_mirrors` now.
 *
 * Two things have to hold for that to be an improvement rather than a
 * migration hazard:
 *
 *  1. The seeded defaults behave exactly like the constants they replaced.
 *  2. A mirror added in Settings is usable by the very next search, with no
 *     restart — otherwise the 11pm domain change still needs a bounce.
 */

import { describe, it, mock, before, after, beforeEach } from 'node:test';
import assert from 'node:assert';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// The server actions revalidate paths; outside a Next request scope that
// throws, and the actions would report failure for work they actually did.
mock.module('next/cache', {
  namedExports: {
    revalidatePath: () => {},
    revalidateTag: () => {},
  },
});

let dataDir: string;
let db: typeof import('../../lib/db/index.js');
let libgen: typeof import('../../lib/services/downloads/libgen.js');
let annas: typeof import('../../lib/services/downloads/annas.js');
let zlibrary: typeof import('../../lib/services/downloads/zlibrary.js');
let sourceStatus: typeof import('../../lib/services/downloads/source-status.js');
let actions: typeof import('../../lib/actions/downloads.js');

const originalFetch = global.fetch;

/** The lists that used to live in libgen.ts / annas.ts / zlibrary.ts. */
const SHIPPED_DEFAULTS: Record<string, string[]> = {
  libgen: ['libgen.vg', 'libgen.la', 'libgen.bz', 'libgen.gl'],
  annas: ['annas-archive.org', 'annas-archive.li'],
  zlibrary: ['z-library.sk', 'z-lib.gl'],
};

describe('Source mirrors', () => {
  before(async () => {
    dataDir = mkdtempSync(join(tmpdir(), 'shelvarr-mirrors-'));
    process.env['DATA_DIR'] = dataDir;
    process.env['DB_PATH'] = join(dataDir, 'test.db');

    db = await import('../../lib/db/index.js');
    db.initDatabase();

    libgen = await import('../../lib/services/downloads/libgen.js');
    annas = await import('../../lib/services/downloads/annas.js');
    zlibrary = await import('../../lib/services/downloads/zlibrary.js');
    sourceStatus = await import('../../lib/services/downloads/source-status.js');
    actions = await import('../../lib/actions/downloads.js');
  });

  after(() => {
    db?.closeDatabase();
    global.fetch = originalFetch;
    rmSync(dataDir, { recursive: true, force: true });
  });

  beforeEach(() => {
    // Back to the seeded state, with no health known about anything.
    const database = db.getDb();
    database.exec('DELETE FROM source_mirrors; DELETE FROM source_status_cache;');
    for (const [source, domains] of Object.entries(SHIPPED_DEFAULTS)) {
      domains.forEach((domain, index) =>
        database
          .prepare(
            `INSERT INTO source_mirrors (source, domain, priority, enabled, added_by)
             VALUES (?, ?, ?, 1, 'seed')`
          )
          .run(source, domain, index)
      );
    }
  });

  describe('seeding', () => {
    it('seeds every shipped mirror, in order, on first run', () => {
      // A database of its own so the seed migration is what we're reading,
      // not the fixture beforeEach writes.
      const seedDir = mkdtempSync(join(tmpdir(), 'shelvarr-mirror-seed-'));
      try {
        db.closeDatabase();
        db.initDatabase(join(seedDir, 'seed.db'));

        for (const [source, domains] of Object.entries(SHIPPED_DEFAULTS)) {
          const mirrors = db.getSourceMirrors(source);
          assert.deepStrictEqual(
            mirrors.map((m) => m.domain),
            domains,
            `${source} should be seeded with its shipped domains, in order`
          );
          assert.ok(mirrors.every((m) => m.enabled === 1));
          assert.ok(mirrors.every((m) => m.added_by === 'seed'));
          assert.deepStrictEqual(
            mirrors.map((m) => m.priority),
            domains.map((_, index) => index)
          );
        }
      } finally {
        db.closeDatabase();
        db.initDatabase();
        rmSync(seedDir, { recursive: true, force: true });
      }
    });

    it('does not re-seed a mirror the operator removed', () => {
      const seedDir = mkdtempSync(join(tmpdir(), 'shelvarr-mirror-reseed-'));
      const seedPath = join(seedDir, 'seed.db');
      try {
        db.closeDatabase();
        db.initDatabase(seedPath);

        const doomed = db.getSourceMirrors('libgen').find((m) => m.domain === 'libgen.bz')!;
        db.deleteSourceMirror(doomed.id);
        db.closeDatabase();

        // Restart: migrations run again against the same file.
        db.initDatabase(seedPath);
        assert.ok(!db.getSourceMirrors('libgen').some((m) => m.domain === 'libgen.bz'));
        assert.strictEqual(db.getSourceMirrors('libgen').length, 3);
      } finally {
        db.closeDatabase();
        db.initDatabase();
        rmSync(seedDir, { recursive: true, force: true });
      }
    });
  });

  describe('the seeded defaults behave like the constants they replaced', () => {
    it('lists every LibGen mirror in the order the constant declared', () => {
      assert.deepStrictEqual(libgen.getLibGenDomains(), SHIPPED_DEFAULTS['libgen']);
    });

    it("falls back to Anna's .li mirror when nothing has been probed", () => {
      // Quirk of the old ANNAS_FALLBACK, preserved deliberately: the
      // fallback is not the highest-priority mirror.
      assert.strictEqual(annas.getAnnasDomain(), 'annas-archive.li');
    });

    it('falls back to z-library.sk when nothing has been probed', () => {
      assert.strictEqual(zlibrary.getZLibraryDomain(), 'z-library.sk');
    });
  });

  describe('health keys off the mirror row', () => {
    const markStatus = (source: string, domain: string, status: 'up' | 'degraded' | 'down') =>
      db.updateSourceStatus(`${source}:${domain}`, status, 10);

    it('derives the status key from the row, and reads it back', async () => {
      const { mirrorStatusKey, parseMirrorStatusKey } = await import(
        '../../lib/services/downloads/mirrors.js'
      );

      // DownloadSourcesTab inlines this format to look up a mirror's badge
      // without reaching for the database; keep the two in step.
      assert.strictEqual(mirrorStatusKey('libgen', 'libgen.la'), 'libgen:libgen.la');
      assert.deepStrictEqual(parseMirrorStatusKey('libgen:libgen.la'), {
        source: 'libgen',
        domain: 'libgen.la',
      });
      assert.strictEqual(parseMirrorStatusKey('libgen'), null);
    });

    it('floats a mirror that is up to the head of the LibGen list', () => {
      markStatus('libgen', 'libgen.bz', 'up');
      markStatus('libgen', 'libgen.vg', 'down');

      const domains = libgen.getLibGenDomains();
      assert.strictEqual(domains[0], 'libgen.bz');
      assert.strictEqual(domains.at(-1), 'libgen.vg');
      assert.strictEqual(domains.length, 4, 'ranking reorders, it never drops a mirror');
    });

    it("prefers an Anna's mirror that is up over the fallback", () => {
      markStatus('annas', 'annas-archive.org', 'up');
      assert.strictEqual(annas.getAnnasDomain(), 'annas-archive.org');
    });

    it('prefers degraded over unprobed, but up over degraded', () => {
      markStatus('zlibrary', 'z-lib.gl', 'degraded');
      assert.strictEqual(zlibrary.getZLibraryDomain(), 'z-lib.gl');

      markStatus('zlibrary', 'z-library.sk', 'up');
      assert.strictEqual(zlibrary.getZLibraryDomain(), 'z-library.sk');
    });

    it('reports a source as reachable when any of its mirrors answers', () => {
      assert.strictEqual(annas.isAnnasAvailable(), false);
      markStatus('annas', 'annas-archive.li', 'degraded');
      assert.strictEqual(annas.isAnnasAvailable(), true);
    });

    it('forgets a mirror-keyed health row when the mirror is deleted', () => {
      markStatus('libgen', 'libgen.gl', 'up');
      const mirror = db.getSourceMirrors('libgen').find((m) => m.domain === 'libgen.gl')!;

      db.deleteSourceMirror(mirror.id);

      assert.strictEqual(db.getSourceStatus('libgen:libgen.gl'), null);
    });
  });

  describe('a mirror added in Settings is live without a restart', () => {
    it('is searched and downloaded from immediately, with no module reloaded', async () => {
      assert.ok(!libgen.getLibGenDomains().includes('libgen.example'));

      const result = await actions.addDownloadSourceMirror('libgen', 'https://LibGen.example/x');
      assert.strictEqual(result.success, true);

      // Same module instances as the assertion above — nothing was
      // re-imported, nothing was restarted.
      assert.ok(libgen.getLibGenDomains().includes('libgen.example'));
      assert.ok(libgen.getLibGenSearchUrl('dune').length > 0);
    });

    it('is used for search URLs as soon as it is probed as up', async () => {
      await actions.addDownloadSourceMirror('annas', 'annas-archive.example');
      db.updateSourceStatus('annas:annas-archive.example', 'up', 5);

      assert.ok(annas.getAnnasSearchUrl('dune').startsWith('https://annas-archive.example/'));
    });

    it('is probed on the next health refresh, with no constant to add', async () => {
      await actions.addDownloadSourceMirror('libgen', 'libgen.example');

      const probed: string[] = [];
      global.fetch = (async (url: string) => {
        probed.push(String(url));
        return new Response('', { status: 200 });
      }) as unknown as typeof fetch;

      await sourceStatus.refreshSourceStatuses();

      assert.ok(probed.some((u) => u.includes('libgen.example')));
      assert.strictEqual(db.getSourceStatus('libgen:libgen.example')?.status, 'up');
      // And the mirror rolls up into the headline source.
      assert.strictEqual(db.getSourceStatus('libgen')?.status, 'up');
    });

    it('is left out of search and download while disabled', async () => {
      await actions.addDownloadSourceMirror('libgen', 'libgen.example');
      const mirror = db.getSourceMirrors('libgen').find((m) => m.domain === 'libgen.example')!;
      assert.strictEqual(mirror.added_by, 'user');

      await actions.toggleDownloadSourceMirror(mirror.id, false);
      assert.ok(!libgen.getLibGenDomains().includes('libgen.example'));

      await actions.toggleDownloadSourceMirror(mirror.id, true);
      assert.ok(libgen.getLibGenDomains().includes('libgen.example'));
    });

    it('goes to the back of the queue, and can be promoted', async () => {
      await actions.addDownloadSourceMirror('libgen', 'libgen.example');
      assert.strictEqual(libgen.getLibGenDomains().at(-1), 'libgen.example');

      const mirror = db.getSourceMirrors('libgen').find((m) => m.domain === 'libgen.example')!;
      for (let i = 0; i < 4; i++) {
        await actions.reorderDownloadSourceMirror(mirror.id, 'up');
      }

      assert.deepStrictEqual(libgen.getLibGenDomains(), [
        'libgen.example',
        ...SHIPPED_DEFAULTS['libgen']!,
      ]);
    });

    it('can be removed again, and search stops using it', async () => {
      await actions.addDownloadSourceMirror('libgen', 'libgen.example');
      const mirror = db.getSourceMirrors('libgen').find((m) => m.domain === 'libgen.example')!;

      await actions.removeDownloadSourceMirror(mirror.id);

      assert.deepStrictEqual(libgen.getLibGenDomains(), SHIPPED_DEFAULTS['libgen']);
    });
  });

  describe('what Settings accepts as a domain', () => {
    it('takes a pasted URL and stores the bare host', () => {
      assert.strictEqual(db.normaliseMirrorDomain('https://LibGen.VG/index.php?req=x'), 'libgen.vg');
      assert.strictEqual(db.normaliseMirrorDomain('  z-lib.gl  '), 'z-lib.gl');
      assert.strictEqual(db.normaliseMirrorDomain('http://mirror.example:8080/'), 'mirror.example:8080');
    });

    it('rejects anything that is not a hostname', () => {
      for (const junk of ['', '   ', 'localhost', 'not a domain', 'https://', '*.libgen.vg']) {
        assert.strictEqual(db.normaliseMirrorDomain(junk), null, `${junk} should be rejected`);
      }
    });

    it('refuses a bad domain and an unmirrored source at the action boundary', async () => {
      const bad = await actions.addDownloadSourceMirror('libgen', 'not a domain');
      assert.strictEqual(bad.success, false);
      assert.match(bad.error!, /valid domain/);

      const wrongSource = await actions.addDownloadSourceMirror('getcomics', 'getcomics.example');
      assert.strictEqual(wrongSource.success, false);
      assert.strictEqual(db.getSourceMirrors('getcomics').length, 0);
    });

    it('treats re-adding an existing mirror as a no-op, not an error', async () => {
      const result = await actions.addDownloadSourceMirror('libgen', 'libgen.vg');
      assert.strictEqual(result.success, true);
      assert.deepStrictEqual(libgen.getLibGenDomains(), SHIPPED_DEFAULTS['libgen']);
    });
  });
});
