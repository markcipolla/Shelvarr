/**
 * Unit tests for SearchAllButton
 *
 * The comics index button that starts the library-wide sweep: search every
 * volume still missing issues and queue whatever turns up. It never blocks on
 * the sweep, so all it has to get right is what it tells the user afterwards
 * — queued, already running, or failed.
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

const mockSearchAll = mock.fn(
  async () => ({ success: true, taskId: 12, alreadyRunning: false }) as any
);

mock.module('../../../lib/actions/comics.js', {
  namedExports: { searchAllComicsAction: mockSearchAll },
});

const { SearchAllButton } = await import('../../../components/comics/SearchAllButton.js');

describe('SearchAllButton', () => {
  beforeEach(() => {
    mockRefresh.mock.resetCalls();
    mockSearchAll.mock.resetCalls();
    mockSearchAll.mock.mockImplementation(
      async () => ({ success: true, taskId: 12, alreadyRunning: false }) as any
    );
  });

  afterEach(() => cleanup());

  it('queues the sweep and points at Downloads', async () => {
    const user = userEvent.setup();
    render(<SearchAllButton />);

    await user.click(screen.getByRole('button', { name: /search for missing issues/i }));

    await waitFor(() => {
      assert.match(screen.getByText(/queued/i).textContent!, /Downloads/);
    });
    assert.strictEqual(mockSearchAll.mock.callCount(), 1);
    assert.strictEqual(mockRefresh.mock.callCount(), 1);
  });

  it('says so when a sweep is already running', async () => {
    mockSearchAll.mock.mockImplementation(
      async () => ({ success: true, taskId: 3, alreadyRunning: true }) as any
    );

    const user = userEvent.setup();
    render(<SearchAllButton />);

    await user.click(screen.getByRole('button', { name: /search for missing issues/i }));

    await waitFor(() => {
      assert.ok(screen.getByText(/already running/i));
    });
  });

  it('shows the failure instead of claiming a search started', async () => {
    mockSearchAll.mock.mockImplementation(
      async () => ({ success: false, error: 'No search sources configured' }) as any
    );

    const user = userEvent.setup();
    render(<SearchAllButton />);

    await user.click(screen.getByRole('button', { name: /search for missing issues/i }));

    await waitFor(() => {
      assert.ok(screen.getByText('No search sources configured'));
    });
    assert.strictEqual(screen.queryByText(/queued/i), null);
  });
});
