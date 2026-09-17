/**
 * Unit tests for the mirror editor in Settings -> Download Sources (E1-1)
 *
 * Mirror domains used to be code constants, so following a domain rotation
 * meant a new release. This covers the surface that replaced them: the
 * mirrors a source has, and adding one — which the server action makes live
 * for the next search without a restart.
 */

import { describe, it, mock, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import '../../../tests/setup-react.js';
import React from 'react';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const mockRefresh = mock.fn();
mock.module('next/navigation', {
  namedExports: { useRouter: () => ({ refresh: mockRefresh }) },
});

const mockAddMirror = mock.fn(async () => ({ success: true }) as { success: boolean; error?: string });
const mockToggleMirror = mock.fn(async () => ({ success: true }));
const mockRemoveMirror = mock.fn(async () => ({ success: true }));
const mockReorderMirror = mock.fn(async () => ({ success: true }));

mock.module('../../../lib/actions/downloads.js', {
  namedExports: {
    toggleDownloadSource: mock.fn(async () => ({ success: true })),
    saveZLibraryCredentials: mock.fn(async () => ({ success: true })),
    clearZLibraryCredentials: mock.fn(async () => ({ success: true })),
    saveAnnasApiKey: mock.fn(async () => ({ success: true })),
    clearAnnasApiKey: mock.fn(async () => ({ success: true })),
    testDownloadSource: mock.fn(async () => ({ success: true, responseTime: 1 })),
    refreshDownloadSourceStatuses: mock.fn(async () => ({ success: true })),
    getDownloadParserHealth: mock.fn(async () => []),
    addDownloadSourceMirror: mockAddMirror,
    toggleDownloadSourceMirror: mockToggleMirror,
    removeDownloadSourceMirror: mockRemoveMirror,
    reorderDownloadSourceMirror: mockReorderMirror,
    // The card expands into a Network section too (E1-7), so the component
    // imports this alongside the mirror actions.
    saveDownloadSourceNetwork: mock.fn(async () => ({ success: true })),
  },
});

const toastError = mock.fn();
mock.module('../../../components/ui/Toast.js', {
  namedExports: {
    useToast: () => ({ success: mock.fn(), error: toastError }),
  },
});

const { DownloadSourcesTab } = await import(
  '../../../components/settings/DownloadSourcesTab.js'
);

const mirror = (id: number, source: string, domain: string, priority: number, addedBy = 'seed') => ({
  id,
  source,
  domain,
  priority,
  enabled: 1,
  added_by: addedBy,
  created_at: '2026-09-17 00:00:00',
});

const MIRRORS = [
  mirror(1, 'libgen', 'libgen.vg', 0),
  mirror(2, 'libgen', 'libgen.la', 1),
  mirror(3, 'annas', 'annas-archive.org', 0),
];

function renderTab() {
  return render(
    <DownloadSourcesTab
      configs={[]}
      statuses={[
        {
          name: 'libgen:libgen.vg',
          displayName: 'libgen.vg',
          status: 'up' as const,
          lastChecked: new Date(),
          url: 'https://libgen.vg',
        },
      ]}
      mirrors={MIRRORS}
    />
  );
}

describe('DownloadSourcesTab mirrors', () => {
  beforeEach(() => {
    mockAddMirror.mock.resetCalls();
    mockToggleMirror.mock.resetCalls();
    mockRemoveMirror.mock.resetCalls();
    mockReorderMirror.mock.resetCalls();
    mockRefresh.mock.resetCalls();
  });

  afterEach(() => cleanup());

  it('lists a source’s mirrors once its card is expanded', async () => {
    const user = userEvent.setup({ document });
    renderTab();

    await user.click(screen.getByLabelText('Show Library Genesis settings'));

    assert.ok(screen.getByTestId('mirror-libgen.vg'));
    assert.ok(screen.getByTestId('mirror-libgen.la'));
    // Anna's mirrors belong to Anna's card, not this one.
    assert.strictEqual(screen.queryByTestId('mirror-annas-archive.org'), null);
  });

  it('adds a mirror, which the action makes live without a restart', async () => {
    const user = userEvent.setup({ document });
    renderTab();

    await user.click(screen.getByLabelText('Show Library Genesis settings'));
    await user.type(
      screen.getByLabelText('New Library Genesis mirror domain'),
      'libgen.example'
    );
    await user.click(screen.getByRole('button', { name: 'Add mirror' }));

    await waitFor(() => assert.strictEqual(mockAddMirror.mock.callCount(), 1));
    assert.deepStrictEqual(mockAddMirror.mock.calls[0]!.arguments, ['libgen', 'libgen.example']);
    // The page re-reads the mirror list so the new one shows up straight away.
    assert.ok(mockRefresh.mock.callCount() >= 1);
  });

  it('surfaces a rejected domain rather than silently dropping it', async () => {
    toastError.mock.resetCalls();
    mockAddMirror.mock.mockImplementationOnce(async () => ({
      success: false,
      error: '"nope" isn\'t a valid domain',
    }));

    const user = userEvent.setup({ document });
    renderTab();

    await user.click(screen.getByLabelText('Show Library Genesis settings'));
    await user.type(screen.getByLabelText('New Library Genesis mirror domain'), 'nope');
    await user.click(screen.getByRole('button', { name: 'Add mirror' }));

    await waitFor(() => assert.strictEqual(toastError.mock.callCount(), 1));
  });

  it('can turn a mirror off without forgetting it', async () => {
    const user = userEvent.setup({ document });
    renderTab();

    await user.click(screen.getByLabelText('Show Library Genesis settings'));
    await user.click(screen.getByLabelText('Use libgen.la'));

    await waitFor(() => assert.strictEqual(mockToggleMirror.mock.callCount(), 1));
    assert.deepStrictEqual(mockToggleMirror.mock.calls[0]!.arguments, [2, false]);
  });

  it('cannot promote the mirror that is already first', async () => {
    const user = userEvent.setup({ document });
    renderTab();

    await user.click(screen.getByLabelText('Show Library Genesis settings'));

    const first = screen.getByLabelText('Move libgen.vg up') as HTMLButtonElement;
    assert.strictEqual(first.disabled, true);

    await user.click(screen.getByLabelText('Move libgen.la up'));
    await waitFor(() => assert.strictEqual(mockReorderMirror.mock.callCount(), 1));
    assert.deepStrictEqual(mockReorderMirror.mock.calls[0]!.arguments, [2, 'up']);
  });
});
