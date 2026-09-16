/**
 * Unit tests for RefreshUnmatchedButton
 *
 * The button starts a metadata task and then reports on it while it runs, so
 * matched books drop off the Unmatched page as they're found. It follows the
 * task on the live event stream rather than asking the server every couple of
 * seconds, so these cover the progress reports, the finish, and the catch-up
 * that stops a dropped connection stranding the button mid-run.
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

const mockSuccess = mock.fn();
const mockError = mock.fn();

mock.module('../../../components/ui/Toast.js', {
  namedExports: {
    useToast: () => ({ toast: () => {}, success: mockSuccess, error: mockError, info: () => {} }),
  },
});

const mockRefreshUnmatched = mock.fn(
  async (_libraryId?: number) => ({ success: true, taskId: 7 }) as any
);

mock.module('../../../lib/actions/libraries.js', {
  namedExports: { refreshUnmatchedMetadata: mockRefreshUnmatched },
});

const mockGetTaskById = mock.fn(async (_id: number) => null as any);

mock.module('../../../lib/actions/tasks.js', {
  namedExports: { getTaskById: mockGetTaskById },
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

const { RefreshUnmatchedButton } = await import(
  '../../../components/books/RefreshUnmatchedButton.js'
);
const { LiveEventsProvider } = await import('../../../components/live/LiveEvents.js');

function task(overrides: Record<string, unknown>) {
  return {
    id: 7,
    type: 'metadata',
    status: 'running',
    progress: 0,
    total: null,
    error: null,
    ...overrides,
  };
}

function taskEvent(overrides: Record<string, unknown>) {
  return {
    kind: 'task',
    event: 'progress',
    id: 7,
    taskType: 'metadata',
    status: 'running',
    progress: 0,
    total: null,
    error: null,
    ...overrides,
  };
}

function stream(): FakeEventSource {
  const found = FakeEventSource.instances.at(-1);
  assert.ok(found, 'expected a stream to have been opened');
  return found;
}

/** Report the stream as connected, as the browser would on opening it. */
function connect() {
  act(() => stream().onopen?.());
}

describe('RefreshUnmatchedButton Component', () => {
  beforeEach(() => {
    mockRefresh.mock.resetCalls();
    mockSuccess.mock.resetCalls();
    mockError.mock.resetCalls();
    mockRefreshUnmatched.mock.resetCalls();
    mockRefreshUnmatched.mock.mockImplementation(async () => ({ success: true, taskId: 7 }));
    mockGetTaskById.mock.resetCalls();
    mockGetTaskById.mock.mockImplementation(async () => task({}));
    FakeEventSource.instances = [];
  });

  afterEach(() => {
    cleanup();
  });

  const renderButton = (props: { libraryId?: number } = {}) =>
    render(
      <LiveEventsProvider>
        <RefreshUnmatchedButton {...props} />
      </LiveEventsProvider>
    );

  it('starts a refresh scoped to the filtered library', async () => {
    const user = userEvent.setup();
    renderButton({ libraryId: 3 });

    await user.click(screen.getByRole('button', { name: 'Refresh Metadata' }));

    await waitFor(() => assert.strictEqual(mockRefreshUnmatched.mock.callCount(), 1));
    assert.strictEqual(mockRefreshUnmatched.mock.calls[0]?.arguments[0], 3);
  });

  it('shows progress as the task reports it, and stops when it completes', async () => {
    const user = userEvent.setup();
    renderButton();

    await user.click(screen.getByRole('button', { name: 'Refresh Metadata' }));
    await waitFor(() => assert.ok(screen.getByRole('button', { name: 'Refreshing...' })));

    act(() => stream().emit('task', taskEvent({ progress: 20, total: 60 })));

    await waitFor(() => assert.ok(screen.getByRole('button', { name: 'Refreshing 20/60...' })));
    assert.ok((screen.getByRole('button') as HTMLButtonElement).disabled);

    act(() => stream().emit('task', taskEvent({ progress: 40, total: 60 })));
    await waitFor(() => assert.ok(screen.getByRole('button', { name: 'Refreshing 40/60...' })));

    mockGetTaskById.mock.mockImplementation(async () =>
      task({ status: 'completed', progress: 60, total: 60, data: { matched: 45 } })
    );
    act(() =>
      stream().emit(
        'task',
        taskEvent({ event: 'completed', status: 'completed', progress: 60, total: 60 })
      )
    );

    await waitFor(() =>
      assert.strictEqual(
        mockSuccess.mock.calls.at(-1)?.arguments[0],
        'Metadata refresh finished: 45 matched'
      )
    );
    assert.ok(screen.getByRole('button', { name: 'Refresh Metadata' }));
  });

  it('asks the server nothing at all while the task is only progressing', async () => {
    const user = userEvent.setup();
    renderButton();

    await user.click(screen.getByRole('button', { name: 'Refresh Metadata' }));
    await waitFor(() => assert.ok(screen.getByRole('button', { name: 'Refreshing...' })));

    const before = mockGetTaskById.mock.callCount();
    act(() => {
      for (let progress = 1; progress <= 25; progress += 1) {
        stream().emit('task', taskEvent({ progress, total: 25 }));
      }
    });

    await waitFor(() => assert.ok(screen.getByRole('button', { name: 'Refreshing 25/25...' })));
    // Where the old polling loop made a request every couple of seconds
    // throughout, twenty-five progress reports now cost none.
    assert.strictEqual(mockGetTaskById.mock.callCount(), before);
  });

  it('reports a failed task', async () => {
    const user = userEvent.setup();
    renderButton();

    await user.click(screen.getByRole('button', { name: 'Refresh Metadata' }));
    await waitFor(() => assert.ok(screen.getByRole('button', { name: 'Refreshing...' })));

    act(() =>
      stream().emit(
        'task',
        taskEvent({ event: 'failed', status: 'failed', error: 'Hardcover is down' })
      )
    );

    await waitFor(() =>
      assert.strictEqual(mockError.mock.calls.at(-1)?.arguments[0], 'Hardcover is down')
    );
    assert.ok(screen.getByRole('button', { name: 'Refresh Metadata' }));
  });

  it('catches up on connect, so a task that finished unseen does not strand the button', async () => {
    const user = userEvent.setup();
    renderButton();

    await user.click(screen.getByRole('button', { name: 'Refresh Metadata' }));
    await waitFor(() => assert.ok(screen.getByRole('button', { name: 'Refreshing...' })));

    // The task finished while nothing was listening — there is no event to
    // replay, so the reconnect has to notice for itself.
    mockGetTaskById.mock.mockImplementation(async () =>
      task({ status: 'completed', data: { matched: 12 } })
    );
    connect();

    await waitFor(() =>
      assert.strictEqual(
        mockSuccess.mock.calls.at(-1)?.arguments[0],
        'Metadata refresh finished: 12 matched'
      )
    );
    assert.ok(screen.getByRole('button', { name: 'Refresh Metadata' }));
  });

  it('gives up on a task that has been cleaned up underneath it', async () => {
    const user = userEvent.setup();
    renderButton();

    await user.click(screen.getByRole('button', { name: 'Refresh Metadata' }));
    await waitFor(() => assert.ok(screen.getByRole('button', { name: 'Refreshing...' })));

    mockGetTaskById.mock.mockImplementation(async () => null);
    connect();

    await waitFor(() => assert.ok(screen.getByRole('button', { name: 'Refresh Metadata' })));
    assert.strictEqual(mockSuccess.mock.calls.at(-1)?.arguments[0], 'Metadata refresh started (Task #7)');
  });

  it('shows the error when the task cannot be started', async () => {
    mockRefreshUnmatched.mock.mockImplementation(async () => ({ error: 'Library not found' }) as any);

    const user = userEvent.setup();
    renderButton({ libraryId: 99 });

    await user.click(screen.getByRole('button', { name: 'Refresh Metadata' }));

    await waitFor(() =>
      assert.strictEqual(mockError.mock.calls.at(-1)?.arguments[0], 'Library not found')
    );
    assert.strictEqual(mockGetTaskById.mock.callCount(), 0);
  });
});
