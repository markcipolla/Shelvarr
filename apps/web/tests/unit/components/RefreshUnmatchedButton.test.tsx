/**
 * Unit tests for RefreshUnmatchedButton
 *
 * The button starts a metadata task and then keeps the Unmatched page current
 * while it runs, so books drop off as they're matched. Covers the start, the
 * live progress, and stopping once the task is done.
 */

import { describe, it, mock, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import '../../../tests/setup-react.js';
import { render, screen, waitFor, cleanup } from '@testing-library/react';
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

const mockRefreshUnmatched = mock.fn(async (_libraryId?: number) => ({ success: true, taskId: 7 }) as any);

mock.module('../../../lib/actions/libraries.js', {
  namedExports: { refreshUnmatchedMetadata: mockRefreshUnmatched },
});

const mockGetTaskById = mock.fn(async (_id: number) => null as any);

mock.module('../../../lib/actions/tasks.js', {
  namedExports: { getTaskById: mockGetTaskById },
});

const { RefreshUnmatchedButton } = await import('../../../components/books/RefreshUnmatchedButton.js');

function task(overrides: Record<string, unknown>) {
  return { id: 7, type: 'metadata', status: 'running', progress: 0, total: null, error: null, ...overrides };
}

describe('RefreshUnmatchedButton Component', () => {
  beforeEach(() => {
    mockRefresh.mock.resetCalls();
    mockSuccess.mock.resetCalls();
    mockError.mock.resetCalls();
    mockRefreshUnmatched.mock.resetCalls();
    mockRefreshUnmatched.mock.mockImplementation(async () => ({ success: true, taskId: 7 }));
    mockGetTaskById.mock.resetCalls();
  });

  afterEach(() => {
    cleanup();
  });

  it('starts a refresh scoped to the filtered library', async () => {
    mockGetTaskById.mock.mockImplementation(async () => task({ status: 'completed', data: { matched: 0 } }));
    const user = userEvent.setup();
    render(<RefreshUnmatchedButton libraryId={3} pollMs={5} />);

    await user.click(screen.getByRole('button', { name: 'Refresh Metadata' }));

    await waitFor(() => assert.strictEqual(mockRefreshUnmatched.mock.callCount(), 1));
    assert.strictEqual(mockRefreshUnmatched.mock.calls[0]?.arguments[0], 3);
  });

  it('shows progress and refreshes the page while the task runs, then stops when it completes', async () => {
    const states = [
      task({ progress: 20, total: 60 }),
      task({ progress: 40, total: 60 }),
      task({ status: 'completed', progress: 60, total: 60, data: { matched: 45 } }),
    ];
    let call = 0;
    mockGetTaskById.mock.mockImplementation(async () => states[Math.min(call++, states.length - 1)]);

    const user = userEvent.setup();
    // Long enough to see each progress state rendered before the next poll.
    render(<RefreshUnmatchedButton pollMs={40} />);

    await user.click(screen.getByRole('button', { name: 'Refresh Metadata' }));

    await waitFor(() => assert.ok(screen.getByRole('button', { name: 'Refreshing 20/60...' })));
    assert.ok((screen.getByRole('button') as HTMLButtonElement).disabled);

    await waitFor(() => assert.strictEqual(mockSuccess.mock.calls.at(-1)?.arguments[0], 'Metadata refresh finished: 45 matched'));
    assert.ok(screen.getByRole('button', { name: 'Refresh Metadata' }));
    assert.strictEqual(mockRefresh.mock.callCount(), 3);

    // Nothing left polling once the task is done.
    const polls = mockGetTaskById.mock.callCount();
    await new Promise((resolve) => setTimeout(resolve, 100));
    assert.strictEqual(mockGetTaskById.mock.callCount(), polls);
  });

  it('keeps polling through a dropped request', async () => {
    let call = 0;
    mockGetTaskById.mock.mockImplementation(async () => {
      if (call++ === 0) throw new Error('network');
      return task({ status: 'completed', data: { matched: 1 } });
    });

    const user = userEvent.setup();
    render(<RefreshUnmatchedButton pollMs={5} />);

    await user.click(screen.getByRole('button', { name: 'Refresh Metadata' }));

    await waitFor(() => assert.strictEqual(mockSuccess.mock.calls.at(-1)?.arguments[0], 'Metadata refresh finished: 1 matched'));
    assert.strictEqual(mockGetTaskById.mock.callCount(), 2);
  });

  it('reports a failed task', async () => {
    mockGetTaskById.mock.mockImplementation(async () => task({ status: 'failed', error: 'Hardcover is down' }));

    const user = userEvent.setup();
    render(<RefreshUnmatchedButton pollMs={5} />);

    await user.click(screen.getByRole('button', { name: 'Refresh Metadata' }));

    await waitFor(() => assert.strictEqual(mockError.mock.calls.at(-1)?.arguments[0], 'Hardcover is down'));
    assert.ok(screen.getByRole('button', { name: 'Refresh Metadata' }));
  });

  it('shows the error when the task cannot be started', async () => {
    mockRefreshUnmatched.mock.mockImplementation(async () => ({ error: 'Library not found' }) as any);

    const user = userEvent.setup();
    render(<RefreshUnmatchedButton libraryId={99} pollMs={5} />);

    await user.click(screen.getByRole('button', { name: 'Refresh Metadata' }));

    await waitFor(() => assert.strictEqual(mockError.mock.calls.at(-1)?.arguments[0], 'Library not found'));
    assert.strictEqual(mockGetTaskById.mock.callCount(), 0);
  });
});
