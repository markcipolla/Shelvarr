/**
 * Unit tests for the duplicate tidy in Settings -> Comics.
 *
 * The library can list the same volume twice — two rows over one folder, or
 * one ComicVine volume adopted under two paths. This covers the button that
 * settles the ones it can and names the ones it will not guess at.
 */

import { describe, it, mock, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import '../../../tests/setup-react.js';
import React from 'react';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

mock.module('next/navigation', {
  namedExports: { useRouter: () => ({ refresh: mock.fn() }) },
});

const mockTidy = mock.fn(async () => ({
  success: true,
  removed: 0,
  unresolved: [] as Array<{ comicvineId: number; title: string; folders: string[] }>,
}));

mock.module('../../../lib/actions/comics.js', {
  namedExports: { tidyComicDuplicatesAction: mockTidy },
});

mock.module('../../../lib/actions/settings.js', {
  namedExports: {
    startComicLibraryImport: mock.fn(async () => ({ success: true })),
    runScheduleNowAction: mock.fn(async () => ({ success: true })),
    setScheduleEnabledAction: mock.fn(async () => ({ success: true })),
    setScheduleIntervalAction: mock.fn(async () => ({ success: true })),
  },
});

const { ComicsTab } = await import('../../../components/settings/ComicsTab.js');

const SETTINGS = { hasApiKey: true };

describe('ComicsTab duplicates', () => {
  beforeEach(() => {
    mockTidy.mock.resetCalls();
  });

  afterEach(() => {
    cleanup();
  });

  it('reports what it removed', async () => {
    mockTidy.mock.mockImplementation(async () => ({
      success: true,
      removed: 3,
      unresolved: [],
    }));

    render(<ComicsTab settings={SETTINGS} schedules={[]} />);
    await userEvent.click(screen.getByRole('button', { name: /tidy duplicates/i }));

    await waitFor(() => screen.getByText(/Removed 3 duplicate volumes/));
    assert.strictEqual(mockTidy.mock.callCount(), 1);
  });

  it('names a volume split across two folders instead of picking one', async () => {
    mockTidy.mock.mockImplementation(async () => ({
      success: true,
      removed: 0,
      unresolved: [
        { comicvineId: 18332, title: 'Saga', folders: ['/comics/Saga', '/comics/Saga (2012)'] },
      ],
    }));

    render(<ComicsTab settings={SETTINGS} schedules={[]} />);
    await userEvent.click(screen.getByRole('button', { name: /tidy duplicates/i }));

    await waitFor(() => screen.getByText(/\/comics\/Saga.*\/comics\/Saga \(2012\)/));
    // Both folders are named, and nothing claims to have been removed.
    assert.ok(screen.getByText(/Nothing to tidy/));
    assert.ok(screen.getByRole('link', { name: 'Saga' }));
  });
});
