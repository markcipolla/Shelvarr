/**
 * Unit tests for the book downloads page's queue component (E2-5).
 *
 * Book and comic downloads are separate id spaces (a `book_downloads` row and
 * a `comic_downloads` row can share an `id`), so on top of the usual
 * rendering/wiring checks, these also confirm the component ignores a live
 * `download` event carrying the same id but the other media type — the
 * scenario `DownloadEvent.mediaType` exists to guard against.
 */

import { describe, it, mock, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import '../../../tests/setup-react.js';
import { render, screen, waitFor, cleanup, act } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';

const mockRefresh = mock.fn();

mock.module('next/navigation', {
  namedExports: {
    useRouter: () => ({
      push: () => {},
      refresh: mockRefresh,
      replace: () => {},
      prefetch: () => {},
      back: () => {},
    }),
  },
});

const mockCancel = mock.fn(async (_id: number) => ({ success: true }));
const mockRetry = mock.fn(async (_id: number) => ({ success: true }));
const mockUnblock = mock.fn(async (_id: number) => ({ success: true }));

mock.module('../../../lib/actions/downloads.js', {
  namedExports: {
    cancelBookDownload: (id: number) => mockCancel(id),
    retryBookDownload: (id: number) => mockRetry(id),
    unblockBookLink: (id: number) => mockUnblock(id),
  },
});

/** Stands in for jsdom's missing EventSource, so a test can push events. */
class FakeEventSource {
  static instances: FakeEventSource[] = [];

  listeners = new Map<string, ((event: { data: string }) => void)[]>();
  onopen: (() => void) | null = null;
  onerror: (() => void) | null = null;

  constructor(public url: string) {
    FakeEventSource.instances.push(this);
  }

  addEventListener(kind: string, handler: (event: { data: string }) => void) {
    this.listeners.set(kind, [...(this.listeners.get(kind) ?? []), handler]);
  }

  close() {}

  emit(kind: string, payload: unknown) {
    for (const handler of this.listeners.get(kind) ?? []) {
      handler({ data: JSON.stringify(payload) });
    }
  }
}

(globalThis as { EventSource?: unknown }).EventSource = FakeEventSource;

const { DownloadQueue } = await import('../../../components/downloads/DownloadQueue.js');
const { LiveEventsProvider } = await import('../../../components/live/LiveEvents.js');

function stream(): FakeEventSource {
  const found = FakeEventSource.instances.at(-1);
  assert.ok(found, 'expected a stream to have been opened');
  return found;
}

function baseData(overrides: Partial<Parameters<typeof DownloadQueue>[0]['data']> = {}) {
  return {
    downloads: [],
    history: [],
    blocklist: [],
    ...overrides,
  };
}

function activeDownload(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    title: 'The Fifth Season',
    author: 'N.K. Jemisin',
    source: 'libgen',
    state: 'downloading',
    progress: 500,
    size: 1000,
    attempts: 1,
    alternates: 0,
    error: null,
    createdAt: '2026-01-01T00:00:00Z',
    libraryId: 1,
    libraryName: 'Fiction',
    ...overrides,
  };
}

describe('DownloadQueue (books)', () => {
  beforeEach(() => {
    mockRefresh.mock.resetCalls();
    mockCancel.mock.resetCalls();
    mockRetry.mock.resetCalls();
    mockUnblock.mock.resetCalls();
    FakeEventSource.instances = [];
  });

  afterEach(() => {
    cleanup();
  });

  const renderQueue = (data: ReturnType<typeof baseData>) =>
    render(
      <LiveEventsProvider>
        <DownloadQueue data={data} />
      </LiveEventsProvider>
    );

  it('shows an empty queue and blocklist when there is nothing going on', () => {
    renderQueue(baseData());
    assert.ok(screen.getByText('Nothing downloading.'));
    assert.ok(screen.getByText('Nothing downloaded yet.'));
    assert.ok(screen.getByText('Nothing blocked.'));
  });

  it('renders an active download with its title, author, source and byte progress', () => {
    renderQueue(baseData({ downloads: [activeDownload()] }));

    assert.ok(screen.getByText('The Fifth Season'));
    assert.ok(screen.getByText(/N\.K\. Jemisin/));
    assert.ok(screen.getByText(/libgen/));
    assert.ok(screen.getByText(/Fiction/));
    assert.ok(screen.getByText(/500 B of 1000 B/));
    assert.ok(screen.getByRole('button', { name: 'Cancel' }));
  });

  it('cancels an active download and refreshes', async () => {
    const user = userEvent.setup();
    renderQueue(baseData({ downloads: [activeDownload()] }));

    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    await waitFor(() => assert.strictEqual(mockCancel.mock.callCount(), 1));
    assert.strictEqual(mockCancel.mock.calls[0]?.arguments[0], 1);
    await waitFor(() => assert.strictEqual(mockRefresh.mock.callCount(), 1));
  });

  it('offers retry on a failed download in the finished list', async () => {
    const user = userEvent.setup();
    renderQueue(
      baseData({
        downloads: [
          activeDownload({ id: 2, state: 'failed', error: 'All LibGen mirrors failed' }),
        ],
      })
    );

    assert.ok(screen.getByText('All LibGen mirrors failed'));
    await user.click(screen.getByRole('button', { name: 'Retry' }));

    await waitFor(() => assert.strictEqual(mockRetry.mock.callCount(), 1));
    assert.strictEqual(mockRetry.mock.calls[0]?.arguments[0], 2);
  });

  it('clears a finished download without offering retry when it succeeded', async () => {
    const user = userEvent.setup();
    renderQueue(baseData({ downloads: [activeDownload({ id: 3, state: 'completed' })] }));

    assert.strictEqual(screen.queryByRole('button', { name: 'Retry' }), null);
    await user.click(screen.getByRole('button', { name: 'Clear' }));

    await waitFor(() => assert.strictEqual(mockCancel.mock.callCount(), 1));
    assert.strictEqual(mockCancel.mock.calls[0]?.arguments[0], 3);
  });

  it('shows history and lets a blocklist entry be unblocked', async () => {
    const user = userEvent.setup();
    renderQueue(
      baseData({
        history: [
          {
            id: 10,
            title: 'Old Book',
            author: 'Someone',
            source: 'libgen',
            success: true,
            downloadedAt: new Date().toISOString(),
          },
        ],
        blocklist: [
          {
            id: 20,
            downloadUrl: 'libgen:dead',
            title: 'Dead Book',
            reason: 'link-broken',
            addedAt: new Date().toISOString(),
          },
        ],
      })
    );

    assert.ok(screen.getByText('Old Book'));
    assert.ok(screen.getByText('Dead Book'));

    await user.click(screen.getByRole('button', { name: 'Unblock' }));
    await waitFor(() => assert.strictEqual(mockUnblock.mock.callCount(), 1));
    assert.strictEqual(mockUnblock.mock.calls[0]?.arguments[0], 20);
  });

  it('moves the progress bar on a live book progress event for the same id', async () => {
    renderQueue(baseData({ downloads: [activeDownload({ id: 5, progress: 100, size: 1000 })] }));
    assert.ok(screen.getByText(/100 B of 1000 B/));

    act(() =>
      stream().emit('download', {
        kind: 'download',
        event: 'progress',
        id: 5,
        mediaType: 'book',
        volumeId: null,
        state: 'downloading',
        progress: 400,
        size: 1000,
      })
    );

    await waitFor(() => assert.ok(screen.getByText(/400 B of 1000 B/)));
  });

  it('ignores a progress event for a comic download that happens to share the id', async () => {
    renderQueue(baseData({ downloads: [activeDownload({ id: 5, progress: 100, size: 1000 })] }));

    act(() =>
      stream().emit('download', {
        kind: 'download',
        event: 'progress',
        id: 5,
        mediaType: 'comic',
        volumeId: 42,
        state: 'downloading',
        progress: 999,
        size: 1000,
      })
    );

    // No mediaType check would have shown 999 B here instead.
    await new Promise((resolve) => setTimeout(resolve, 200));
    assert.ok(screen.getByText(/100 B of 1000 B/));
    assert.strictEqual(screen.queryByText(/999 B/), null);
  });

  it('refreshes on a book download state change but not on a comic one sharing the id', async () => {
    renderQueue(baseData({ downloads: [activeDownload({ id: 5 })] }));

    act(() =>
      stream().emit('download', {
        kind: 'download',
        event: 'state',
        id: 5,
        mediaType: 'comic',
        volumeId: 42,
        state: 'completed',
        progress: 1000,
        size: 1000,
      })
    );
    await new Promise((resolve) => setTimeout(resolve, 700));
    assert.strictEqual(mockRefresh.mock.callCount(), 0);

    act(() =>
      stream().emit('download', {
        kind: 'download',
        event: 'state',
        id: 5,
        mediaType: 'book',
        volumeId: null,
        state: 'completed',
        progress: 1000,
        size: 1000,
      })
    );
    await waitFor(() => assert.strictEqual(mockRefresh.mock.callCount(), 1));
  });
});
