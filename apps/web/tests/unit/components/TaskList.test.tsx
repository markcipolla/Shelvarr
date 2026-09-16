/**
 * Unit tests for TaskList
 *
 * A comic download counts bytes rather than items, and the task row on its
 * own says nothing about which comic it is for. These cover both: the volume
 * and issue being fetched, and sizes read as sizes — and that those sizes
 * follow the live event stream rather than sitting on whatever the server
 * rendered.
 */

import { describe, it, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert';
import '../../../tests/setup-react.js';
import { render, screen, cleanup, act } from '@testing-library/react';

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

mock.module('next/link', {
  namedExports: {},
  defaultExport: ({ children, href, ...rest }: any) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
});

mock.module('../../../components/ui/Toast.js', {
  namedExports: {
    useToast: () => ({ toast: () => {}, success: () => {}, error: () => {}, info: () => {} }),
  },
});

mock.module('../../../lib/actions/tasks.js', {
  namedExports: {
    cancelTask: async () => ({ success: true }),
    retryTask: async () => ({ success: true }),
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

const { TaskList } = await import('../../../components/tasks/TaskList.js');
const { LiveEventsProvider } = await import('../../../components/live/LiveEvents.js');

const MB = 1024 * 1024;

function comicDownloadTask(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    type: 'comic_download',
    status: 'running',
    progress: 12 * MB,
    total: 48 * MB,
    result: null,
    error: null,
    createdAt: new Date().toISOString(),
    completedAt: null,
    data: {
      comicDownloadId: 3,
      comicDownload: {
        volumeId: 7,
        volumeSlug: 'saga-2012',
        volumeTitle: 'Saga',
        issueLabel: '#12',
        releaseTitle: 'Saga 012 (2012) (Digital)',
        host: 'pixeldrain',
        state: 'downloading',
      },
    },
    ...overrides,
  } as never;
}

describe('TaskList Component', () => {
  beforeEach(() => {
    cleanup();
  });

  afterEach(() => {
    cleanup();
  });

  it('names the comic being downloaded and links to it', () => {
    render(<TaskList tasks={[comicDownloadTask()]} />);

    const link = screen.getByRole('link', { name: 'Saga' });
    assert.strictEqual(link.getAttribute('href'), '/comics/saga-2012');
    assert.ok(screen.getByText('#12'));
    assert.ok(screen.getByText(/Saga 012 \(2012\) \(Digital\)/));
    assert.ok(screen.getByText(/pixeldrain/));
  });

  it('reads download progress as a file size', () => {
    render(<TaskList tasks={[comicDownloadTask()]} />);

    assert.ok(screen.getByText('12.0 MB / 48.0 MB'));
  });

  it('shows the size of the file that landed once it is done', () => {
    render(
      <TaskList
        tasks={[
          comicDownloadTask({
            status: 'completed',
            completedAt: new Date().toISOString(),
            data: {
              ...(comicDownloadTask().data as Record<string, unknown>),
              bytes: 42 * MB,
            },
          }),
        ]}
      />
    );

    assert.ok(screen.getByText(/42\.0 MB/));
  });

  it('still counts items for tasks that count items', () => {
    render(
      <TaskList
        tasks={[
          {
            id: 2,
            type: 'comic_update_all',
            status: 'running',
            progress: 3,
            total: 12,
            result: null,
            error: null,
            createdAt: new Date().toISOString(),
            completedAt: null,
            data: {},
          } as never,
        ]}
      />
    );

    assert.ok(screen.getByText('3 / 12'));
  });
});

/**
 * A running task reports progress far too often to re-render the page for, so
 * the row patches the numbers in place. These hold the two halves together:
 * the figure that moves is the one the label is formatted from.
 */
describe('TaskList live progress', () => {
  beforeEach(() => {
    cleanup();
    FakeEventSource.instances = [];
  });

  afterEach(() => {
    cleanup();
  });

  const renderLive = (tasks: unknown[]) =>
    render(
      <LiveEventsProvider>
        <TaskList tasks={tasks as never} />
      </LiveEventsProvider>
    );

  const emit = (payload: Record<string, unknown>) => {
    const stream = FakeEventSource.instances.at(-1);
    assert.ok(stream, 'expected the provider to have opened a stream');
    act(() =>
      stream.emit('task', {
        kind: 'task',
        event: 'progress',
        taskType: 'comic_download',
        status: 'running',
        ...payload,
      })
    );
  };

  it('moves the file size as the download reports bytes', () => {
    renderLive([comicDownloadTask()]);
    assert.ok(screen.getByText('12.0 MB / 48.0 MB'));

    emit({ id: 1, progress: 36 * MB, total: 48 * MB });

    assert.ok(screen.getByText('36.0 MB / 48.0 MB'));
  });

  it('moves the item count too, for tasks that count items', () => {
    renderLive([
      {
        id: 2,
        type: 'comic_update_all',
        status: 'running',
        progress: 3,
        total: 12,
        result: null,
        error: null,
        createdAt: new Date().toISOString(),
        completedAt: null,
        data: {},
      },
    ]);
    assert.ok(screen.getByText('3 / 12'));

    emit({ id: 2, taskType: 'comic_update_all', progress: 9, total: 12 });

    assert.ok(screen.getByText('9 / 12'));
  });

  it('leaves a row alone when the event is for a different task', () => {
    renderLive([comicDownloadTask()]);

    emit({ id: 99, progress: 47 * MB, total: 48 * MB });

    assert.ok(screen.getByText('12.0 MB / 48.0 MB'));
  });
});
