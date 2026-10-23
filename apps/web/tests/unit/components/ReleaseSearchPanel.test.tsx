/**
 * Unit tests for ReleaseSearchPanel, the manual GetComics release search.
 *
 * The thing worth covering is the indicator: an auto-search that queues
 * nothing used to be a silent success, and the three different nothings
 * behind it each want a different next move. Each one has to say which it is.
 */

import { describe, it, mock, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import '../../../tests/setup-react.js';
import { render, screen, waitFor, cleanup } from '@testing-library/react';
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

let searchResponse: any = { results: [], queries: [] };
const searchCalls: any[] = [];
let queueResponse: any = { success: true, queued: 1 };
const queueCalls: any[] = [];

mock.module('../../../lib/actions/comics.js', {
  namedExports: {
    searchComicReleasesAction: async (volumeId: number, options: unknown) => {
      searchCalls.push({ volumeId, options });
      return searchResponse;
    },
    queueComicReleaseAction: async (volumeId: number, link: string, options: unknown) => {
      queueCalls.push({ volumeId, link, options });
      return queueResponse;
    },
  },
});

const { ReleaseSearchPanel } = await import(
  '../../../components/comics/ReleaseSearchPanel.js'
);

function release(overrides: Record<string, unknown> = {}) {
  return {
    link: 'https://getcomics.org/post/alien-king-killer-1',
    displayTitle: 'Alien - King Killer #1 (2026)',
    issueNumber: '1',
    year: 2026,
    match: true,
    matchIssue: null,
    ...overrides,
  };
}

describe('ReleaseSearchPanel', () => {
  beforeEach(() => {
    searchCalls.length = 0;
    queueCalls.length = 0;
    searchResponse = { results: [], queries: [] };
    queueResponse = { success: true, queued: 1 };
  });

  afterEach(cleanup);

  it('runs the generated search on open and lists what was asked for', async () => {
    searchResponse = { results: [release()], queries: ['Alien King Killer (2026)'] };
    render(<ReleaseSearchPanel volumeId={774} subject="Alien: King Killer" />);

    await waitFor(() => assert.ok(screen.getByText(/1 release found/)));
    assert.strictEqual(searchCalls.length, 1);
    assert.strictEqual(searchCalls[0].volumeId, 774);
    assert.strictEqual(searchCalls[0].options.query, null);
    assert.ok(screen.getByText(/Searched for: “Alien King Killer \(2026\)”/));
  });

  it('says so when GetComics returns nothing at all', async () => {
    searchResponse = { results: [], queries: ['Alien King Killer'] };
    render(<ReleaseSearchPanel volumeId={774} subject="Alien: King Killer" />);

    await waitFor(() => assert.ok(screen.getByText(/GetComics returned 0 results/)));
  });

  it('distinguishes results that came back but were all rejected', async () => {
    searchResponse = {
      results: [release({ match: false, matchIssue: "Year doesn't match" })],
      queries: ['Alien King Killer'],
    };
    render(<ReleaseSearchPanel volumeId={774} subject="Alien: King Killer" />);

    await waitFor(() =>
      assert.ok(screen.getByText(/1 release found, but none matched this volume/))
    );
    assert.ok(screen.getByText(/Skipped: Year doesn't match/));
  });

  it('distinguishes a search that never went out', async () => {
    searchResponse = { results: [], queries: [] };
    render(<ReleaseSearchPanel volumeId={774} subject="Alien: King Killer" />);

    await waitFor(() => assert.ok(screen.getByText(/Nothing was searched for/)));
  });

  it('searches the typed query instead of the generated one', async () => {
    searchResponse = { results: [], queries: ['king killer'] };
    const user = userEvent.setup();
    render(<ReleaseSearchPanel volumeId={774} subject="Alien: King Killer" />);

    await waitFor(() => assert.strictEqual(searchCalls.length, 1));
    await user.type(screen.getByRole('searchbox'), 'king killer');
    await user.click(screen.getByRole('button', { name: 'Search' }));

    await waitFor(() => assert.strictEqual(searchCalls.length, 2));
    assert.strictEqual(searchCalls[1].options.query, 'king killer');
  });

  it('forces the match only when grabbing a rejected release', async () => {
    searchResponse = {
      results: [release({ match: false, matchIssue: "Titles don't match" })],
      queries: ['x'],
    };
    const user = userEvent.setup();
    render(<ReleaseSearchPanel volumeId={774} subject="Alien: King Killer" />);

    await waitFor(() => assert.ok(screen.getByRole('button', { name: 'Download anyway' })));
    await user.click(screen.getByRole('button', { name: 'Download anyway' }));

    await waitFor(() => assert.strictEqual(queueCalls.length, 1));
    assert.strictEqual(queueCalls[0].options.forceMatch, true);
    assert.ok(screen.getByText('Queued 1 download.'));
  });

  it('closes itself once something is queued', async () => {
    searchResponse = { results: [release()], queries: ['x'] };
    let closed = 0;
    const user = userEvent.setup();
    render(
      <ReleaseSearchPanel
        volumeId={774}
        subject="Alien: King Killer"
        onClose={() => {
          closed += 1;
        }}
      />
    );

    await waitFor(() => assert.ok(screen.getByRole('button', { name: 'Download' })));
    await user.click(screen.getByRole('button', { name: 'Download' }));

    await waitFor(() => assert.strictEqual(closed, 1));
  });

  it('reports a page whose links were all dead rather than claiming success', async () => {
    searchResponse = { results: [release()], queries: ['x'] };
    queueResponse = { success: true, queued: 0 };
    let closed = 0;
    const user = userEvent.setup();
    render(
      <ReleaseSearchPanel
        volumeId={774}
        subject="Alien: King Killer"
        onClose={() => {
          closed += 1;
        }}
      />
    );

    await waitFor(() => assert.ok(screen.getByRole('button', { name: 'Download' })));
    await user.click(screen.getByRole('button', { name: 'Download' }));

    await waitFor(() => assert.ok(screen.getByText(/links are all dead or unsupported/)));
    assert.strictEqual(closed, 0);
  });

  it('surfaces a disabled source instead of showing an empty list', async () => {
    searchResponse = { results: [], queries: [], error: 'GetComics is switched off' };
    render(<ReleaseSearchPanel volumeId={774} subject="Alien: King Killer" />);

    await waitFor(() => assert.ok(screen.getByText('GetComics is switched off')));
    assert.strictEqual(screen.queryByText(/GetComics returned 0 results/), null);
  });
});
