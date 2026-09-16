/**
 * A library import scan resumes where the last one stopped.
 *
 * ComicVine's hourly cap is far below what a large library needs, so a scan of
 * one gets throttled partway through every time. These tests drive the real
 * task handler twice over the same tree and assert the second run spends its
 * searches on the folders the first never reached, rather than starting over.
 */

import { describe, it, before, after, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

const testDir = mkdtempSync(join(tmpdir(), 'shelvarr-import-resume-'));
process.env['DATA_DIR'] = testDir;
process.env['DB_PATH'] = join(testDir, 'test.db');

const db = await import('../../lib/db/index.js');
const { createTask, runTask, getTask } = await import('../../lib/services/queue/index.js');

/**
 * The tree every test scans. The walk order is whatever `readdir` gives back,
 * so which of these a throttled run reaches is read off its result rather than
 * assumed here.
 */
const FOLDERS = ['Alpha', 'Beta', 'Gamma', 'Delta'];

interface StoredProposal {
  folder: string;
  series: string;
  failure: string | null;
  candidates: Array<{ comicvineId: number }>;
  suggestedComicvineId: number | null;
}

describe('Resuming a library import scan', () => {
  const originalFetch = global.fetch;
  let tree: string;
  /** Every series name ComicVine was asked about, across all runs. */
  let queries: string[];
  /** How many searches to answer before pretending the quota ran out. */
  let quota: number;

  before(async () => {
    db.initDatabase();

    const { initServiceConfig } = await import('@shelvarr/services');
    initServiceConfig({
      dataDir: testDir,
      libraryRoot: testDir,
      dbPath: join(testDir, 'test.db'),
      comicPaths: { pathMap: null },
      getcomics: {
        baseUrl: 'https://getcomics.example',
        downloadDir: join(testDir, 'downloads'),
        hostPreference: ['getcomics'],
        renameDownloadedFiles: true,
      },
      supportedExtensions: ['.cbz'],
    });

    const { registerAllHandlers } = await import('../../lib/services/queue/handlers.js');
    registerAllHandlers();

    tree = join(testDir, 'comics');
    for (const name of FOLDERS) {
      mkdirSync(join(tree, name), { recursive: true });
      writeFileSync(join(tree, name, `${name} (2012) Issue 001.cbz`), 'x');
    }
  });

  after(() => {
    db.closeDatabase();
    rmSync(testDir, { recursive: true, force: true });
  });

  beforeEach(() => {
    db.getDb().exec('DELETE FROM tasks; DELETE FROM comics;');
    db.setSetting('comicvine_api_key', 'test-key');
    queries = [];
    quota = FOLDERS.length;

    global.fetch = (async (url: URL | string) => {
      const query = new URL(String(url)).searchParams.get('query') ?? '';
      queries.push(query);

      if (queries.length > quota) {
        // What ComicVine says once the hourly limit is gone: a 200 carrying
        // its own status code.
        return new Response(
          JSON.stringify({ status_code: 107, error: 'Rate Limit Exceeded', results: [] }),
          { status: 200 }
        );
      }

      // A single exact match, so the folder ends up with a real answer.
      return new Response(
        JSON.stringify({
          status_code: 1,
          error: 'OK',
          number_of_total_results: 1,
          results: [
            {
              id: 1000 + queries.length,
              name: query.replace(/ \d{4}$/, ''),
              deck: 'Volume 1',
              start_year: '2012',
              description: '<p>A comic.</p>',
              image: { small_url: 'https://comicvine.example/cover.jpg' },
              publisher: { name: 'Image' },
              site_detail_url: 'https://comicvine.example/x/',
              aliases: '',
              count_of_issues: 6,
            },
          ],
        }),
        { status: 200 }
      );
    }) as typeof fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    db.setSetting('comicvine_api_key', '');
  });

  const sorted = (values: string[]) => [...values].sort();

  /** How many folders got an answer, and how many failed for each reason. */
  function countFailures(proposals: StoredProposal[]): Record<string, number> {
    const counts: Record<string, number> = {};
    for (const proposal of proposals) {
      const key = proposal.failure ?? 'answered';
      counts[key] = (counts[key] ?? 0) + 1;
    }
    return counts;
  }

  /** Run one scan of the tree to completion and return what it stored. */
  async function scan(): Promise<StoredProposal[]> {
    const task = createTask('comic_library_import', { path: tree });
    await runTask(task.id);

    const finished = getTask(task.id);
    assert.strictEqual(finished?.status, 'completed', finished?.error ?? '');
    return (finished.data as { proposals: StoredProposal[] }).proposals;
  }

  it('searches only the folders the throttled run never reached', async () => {
    // Enough quota for the first two folders, then the shutters come down.
    quota = 2;
    const first = await scan();

    assert.strictEqual(first.length, 4, 'every folder is still listed');
    assert.strictEqual(queries.length, 3, 'two answered, the third hit the limit');
    assert.deepStrictEqual(countFailures(first), {
      answered: 2,
      'rate-limited': 1,
      'not-searched': 1,
    });

    const unanswered = first
      .filter((proposal) => proposal.failure !== null)
      .map((proposal) => proposal.series);

    // An hour passes; the quota is back.
    queries = [];
    quota = FOLDERS.length;
    const second = await scan();

    // The two that already had an answer cost nothing this time.
    assert.deepStrictEqual(sorted(queries), sorted(unanswered.map((s) => `${s} 2012`)));
    assert.ok(
      second.every((proposal) => proposal.failure === null),
      'every folder has an answer once the second run finishes'
    );
    assert.deepStrictEqual(sorted(second.map((proposal) => proposal.series)), sorted(FOLDERS));
  });

  it('carries the earlier run’s candidates through, not just the fact of a match', async () => {
    quota = 1;
    const first = await scan();
    const before = first.find((proposal) => proposal.failure === null)!;
    assert.strictEqual(before.candidates.length, 1);

    queries = [];
    quota = FOLDERS.length;
    const second = await scan();
    const after = second.find((proposal) => proposal.folder === before.folder)!;

    // Identical, without that folder costing a single request this time.
    assert.ok(!queries.includes(`${before.series} 2012`));
    assert.deepStrictEqual(after.candidates, before.candidates);
    assert.strictEqual(after.suggestedComicvineId, before.suggestedComicvineId);
  });

  it('works through the tree a quota at a time instead of looping forever', async () => {
    quota = 2;
    const first = await scan();
    const unanswered = first
      .filter((proposal) => proposal.failure !== null)
      .map((proposal) => `${proposal.series} 2012`);
    assert.strictEqual(unanswered.length, 2);

    queries = [];
    quota = 2;
    const second = await scan();
    assert.deepStrictEqual(sorted(queries), sorted(unanswered));
    assert.ok(
      second.every((proposal) => proposal.failure === null),
      'the whole tree is answered for by the second run'
    );

    // A further run has nothing left to ask about.
    queries = [];
    await scan();
    assert.deepStrictEqual(queries, []);
  });

  it('starts over when the scan is pointed at a different folder', async () => {
    quota = FOLDERS.length;
    await scan();

    const otherTree = join(testDir, 'other-comics');
    mkdirSync(join(otherTree, 'Alpha'), { recursive: true });
    writeFileSync(join(otherTree, 'Alpha', 'Alpha (2012) Issue 001.cbz'), 'x');

    queries = [];
    const task = createTask('comic_library_import', { path: otherTree });
    await runTask(task.id);

    // Same series name, different tree: the earlier answers say nothing about
    // these folders, so it searches from scratch.
    assert.deepStrictEqual(queries, ['Alpha 2012']);
  });
});
