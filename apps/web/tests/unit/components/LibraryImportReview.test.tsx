/**
 * Unit tests for LibraryImportReview, the "Import an existing library" page.
 *
 * The distinction being pinned here is the one that sent someone off to add
 * 275 volumes by hand: a folder ComicVine was asked about and had nothing for
 * is a miss, a folder the hourly quota ran out before reaching is not, and the
 * page has to say which is which.
 */

import { describe, it, mock, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import '../../../tests/setup-react.js';
import { render, screen, cleanup } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';

mock.module('next/navigation', {
  namedExports: {
    useRouter: () => ({
      push: () => {},
      refresh: () => {},
      replace: () => {},
      prefetch: () => {},
      back: () => {},
    }),
  },
});

const applyCalls: unknown[][] = [];
mock.module('../../../lib/actions/comics.js', {
  namedExports: {
    applyLibraryImportAction: (...args: unknown[]) => {
      applyCalls.push(args);
      return Promise.resolve({ success: true, taskId: 1 });
    },
  },
});

const scanCalls: string[] = [];
mock.module('../../../lib/actions/settings.js', {
  namedExports: {
    startComicLibraryImport: (path: string) => {
      scanCalls.push(path);
      return Promise.resolve({ success: true, taskId: 2 });
    },
  },
});

const { LibraryImportReview } = await import(
  '../../../components/comics/LibraryImportReview.js'
);

function proposal(overrides: Record<string, unknown> = {}) {
  return {
    folder: '/libraries/comics/Saga',
    series: 'Saga',
    year: 2012,
    fileCount: 72,
    suggestedComicvineId: null,
    checked: true,
    alreadyAdded: null,
    alreadyAddedSlug: null,
    alreadyAddedManaged: false,
    candidates: [],
    ...overrides,
  } as any;
}

function run(overrides: Record<string, unknown> = {}) {
  return {
    taskId: 7,
    status: 'completed',
    path: '/libraries/comics',
    progress: 2,
    total: 2,
    error: null,
    quotaSpent: false,
    merged: 0,
    proposals: [],
    ...overrides,
  } as any;
}

describe('LibraryImportReview', () => {
  beforeEach(() => {
    applyCalls.length = 0;
    scanCalls.length = 0;
  });

  afterEach(() => {
    cleanup();
  });

  it('tells a folder ComicVine had nothing for apart from one it never asked about', () => {
    render(
      <LibraryImportReview
        run={run({
          quotaSpent: true,
          proposals: [
            proposal({ folder: '/libraries/comics/Obscure Zine', series: 'Obscure Zine' }),
            proposal({
              folder: '/libraries/comics/Saga',
              series: 'Saga',
              checked: false,
            }),
          ],
        })}
        apply={null}
        rootFolders={[{ id: 1, path: '/libraries/comics' }]}
      />
    );

    assert.ok(screen.getByText(/ComicVine had no match/));
    assert.ok(screen.getByText(/Not asked yet/));
  });

  it('offers to carry on scanning the folders the quota ran out before', async () => {
    render(
      <LibraryImportReview
        run={run({
          quotaSpent: true,
          proposals: [proposal({ checked: false })],
        })}
        apply={null}
        rootFolders={[{ id: 1, path: '/libraries/comics' }]}
      />
    );

    assert.ok(screen.getByText(/hourly request budget ran out with 1 folder/));
    await userEvent.click(screen.getByRole('button', { name: /Continue scanning/ }));
    assert.deepStrictEqual(scanCalls, ['/libraries/comics']);
  });

  it('reports an import that is waiting out the quota rather than one that failed', () => {
    render(
      <LibraryImportReview
        run={run({ proposals: [proposal({ checked: true })] })}
        apply={{
          taskId: 9,
          status: 'pending',
          progress: 120,
          total: 235,
          error: 'Rate limited - queued for retry (#1)',
          imported: 120,
          failed: [],
          remaining: 115,
        }}
        rootFolders={[{ id: 1, path: '/libraries/comics' }]}
      />
    );

    assert.ok(screen.getByText(/120 imported, 115 to go/));
  });

  it('says an import that has not started yet is starting, and will not take a second', () => {
    render(
      <LibraryImportReview
        run={run({ proposals: [proposal({ checked: true })] })}
        apply={{
          taskId: 9,
          status: 'pending',
          progress: 0,
          total: null,
          error: null,
          imported: 0,
          failed: [],
          remaining: 235,
        }}
        rootFolders={[{ id: 1, path: '/libraries/comics' }]}
      />
    );

    assert.strictEqual(screen.queryByText(/Waiting out/), null);
    // Both the panel and the button say so, and the button is out of action
    // while an import is in flight.
    assert.ok(screen.getAllByText(/Importing/).length >= 2);
    assert.ok(
      screen.getByRole('button', { name: /Importing/ }).hasAttribute('disabled'),
      'the Import button is disabled while one is already going'
    );
  });

  it('starts the import as a background task with what was ticked', async () => {
    render(
      <LibraryImportReview
        run={run({
          proposals: [
            proposal({
              folder: '/libraries/comics/Saga',
              suggestedComicvineId: 4050,
              candidates: [
                {
                  comicvineId: 4050,
                  title: 'Saga',
                  year: 2012,
                  volumeNumber: 1,
                  publisher: 'Image',
                  issueCount: 66,
                },
              ],
            }),
          ],
        })}
        apply={null}
        rootFolders={[{ id: 1, path: '/libraries/comics' }]}
      />
    );

    await userEvent.click(screen.getByRole('button', { name: /^Import 1$/ }));

    assert.strictEqual(applyCalls.length, 1);
    assert.deepStrictEqual(applyCalls[0]![0], [
      { folder: '/libraries/comics/Saga', comicvineId: 4050 },
    ]);
  });
});
