/**
 * Unit tests for TaskList
 *
 * A comic download counts bytes rather than items, and the task row on its
 * own says nothing about which comic it is for. These cover both: the volume
 * and issue being fetched, and sizes read as sizes.
 */

import { describe, it, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert';
import '../../../tests/setup-react.js';
import { render, screen, cleanup } from '@testing-library/react';

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

const { TaskList } = await import('../../../components/tasks/TaskList.js');

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
