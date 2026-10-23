/**
 * Unit tests for the two duplicate tidies in Settings -> Comics.
 *
 * The library can list the same volume twice — two rows over one folder, or
 * one ComicVine volume adopted under two paths — and it can hold the same
 * file twice, where an import filed one copy as `… (2)`. This covers the
 * button that settles the volumes it can and names the ones it will not guess
 * at, and the one that lists redundant files before deleting any.
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

const mockFindFiles = mock.fn(async () => ({
  success: true,
  groups: [] as Array<{
    volumeTitle: string;
    keep: string;
    remove: string[];
    bytes: number;
  }>,
  bytes: 0,
}));

const mockRemoveFiles = mock.fn(async () => ({
  success: true,
  removed: 0,
  bytes: 0,
  errors: [] as Array<{ path: string; error: string }>,
}));

mock.module('../../../lib/actions/comics.js', {
  namedExports: {
    tidyComicDuplicatesAction: mockTidy,
    findDuplicateComicFilesAction: mockFindFiles,
    removeDuplicateComicFilesAction: mockRemoveFiles,
  },
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

describe('ComicsTab duplicate files', () => {
  beforeEach(() => {
    mockFindFiles.mock.resetCalls();
    mockRemoveFiles.mock.resetCalls();
  });

  afterEach(() => {
    cleanup();
  });

  // Deleting files is not something to do on one click: the copies are named
  // first, and the delete button only exists once there is something to delete.
  it('lists the copies before offering to delete any', async () => {
    mockFindFiles.mock.mockImplementation(async () => ({
      success: true,
      groups: [
        {
          volumeTitle: 'Void Rivals',
          keep: '/comics/Void Rivals/Void Rivals (2023) Volume 01 Issue 032.cbr',
          remove: ['/comics/Void Rivals/Void Rivals (2023) Volume 01 Issue 032 (2).cbr'],
          bytes: 41481590,
        },
      ],
      bytes: 41481590,
    }));

    render(<ComicsTab settings={SETTINGS} schedules={[]} />);
    assert.strictEqual(
      screen.queryByRole('button', { name: /delete/i }),
      null,
      'nothing to delete until it has looked'
    );

    await userEvent.click(screen.getByRole('button', { name: /find duplicate files/i }));

    await waitFor(() => screen.getByText(/1 redundant copy/));
    assert.ok(screen.getByText(/keep Void Rivals \(2023\) Volume 01 Issue 032\.cbr/));
    assert.ok(screen.getByText(/delete Void Rivals \(2023\) Volume 01 Issue 032 \(2\)\.cbr/));
    assert.strictEqual(mockRemoveFiles.mock.callCount(), 0, 'nothing was deleted');

    await userEvent.click(screen.getByRole('button', { name: /^Delete 1 copy$/ }));

    await waitFor(() => screen.getByText(/Nothing was removed/));
    assert.strictEqual(mockRemoveFiles.mock.callCount(), 1);
  });

  it('says so when there is nothing held twice', async () => {
    mockFindFiles.mock.mockImplementation(async () => ({
      success: true,
      groups: [],
      bytes: 0,
    }));

    render(<ComicsTab settings={SETTINGS} schedules={[]} />);
    await userEvent.click(screen.getByRole('button', { name: /find duplicate files/i }));

    await waitFor(() => screen.getByText(/no file is held twice/i));
    assert.strictEqual(screen.queryByRole('button', { name: /delete/i }), null);
  });
});
