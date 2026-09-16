/**
 * Unit tests for DownloadSourcesModal
 *
 * LibGen, Anna's Archive and Z-Library are shadow libraries and default to
 * disabled until an operator opts in from Settings. This covers the
 * resulting empty state: when none of them are enabled, the modal must say
 * so plainly and skip searching, rather than silently showing "no results".
 */

import { describe, it, mock, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import '../../../tests/setup-react.js';
import React from 'react';
import { render, screen, waitFor, cleanup } from '@testing-library/react';

// Mock next/link: it needs an app-router context we don't set up here.
const Link = ({ href, children, ...props }: any) => (
  <a href={href} {...props}>
    {children}
  </a>
);
mock.module('next/link', {
  namedExports: {},
  defaultExport: Link,
});

const mockGetLibraries = mock.fn(async () => []);
const mockGetDownloadSearchLinks = mock.fn(async () => ({
  zlibrary: 'https://z-lib.example/search',
  annas: 'https://annas-archive.example/search',
  libgen: 'https://libgen.example/search',
}));
const mockGetDownloadSourceStatuses = mock.fn(async () => []);
const mockGetDownloadConfigs = mock.fn(async () => [] as { source: string; enabled: number }[]);
const mockSearchDownloads = mock.fn(async () => ({ success: true, results: [] }));

mock.module('../../../lib/actions/downloads.js', {
  namedExports: {
    searchDownloads: mockSearchDownloads,
    getDownloadSearchLinks: mockGetDownloadSearchLinks,
    getDownloadSourceStatuses: mockGetDownloadSourceStatuses,
    getDownloadConfigs: mockGetDownloadConfigs,
    queueDownload: mock.fn(),
  },
});

mock.module('../../../lib/actions/libraries.js', {
  namedExports: { getLibraries: mockGetLibraries },
});

mock.module('../../../components/ui/Toast.js', {
  namedExports: {
    useToast: () => ({ success: mock.fn(), error: mock.fn() }),
  },
});

const { DownloadSourcesModal } = await import(
  '../../../components/wanted/DownloadSourcesModal.js'
);

const book = {
  id: 1,
  title: 'Dune',
  author: 'Frank Herbert',
  isbn: null,
} as any;

describe('DownloadSourcesModal', () => {
  beforeEach(() => {
    mockGetLibraries.mock.resetCalls();
    mockGetDownloadSearchLinks.mock.resetCalls();
    mockGetDownloadSourceStatuses.mock.resetCalls();
    mockGetDownloadConfigs.mock.resetCalls();
    mockSearchDownloads.mock.resetCalls();
    mockGetDownloadConfigs.mock.mockImplementation(async () => []);
    mockSearchDownloads.mock.mockImplementation(async () => ({ success: true, results: [] }));
  });

  afterEach(() => {
    cleanup();
  });

  it('explains that shadow libraries are off and skips searching when none are enabled', async () => {
    render(<DownloadSourcesModal book={book} onClose={() => {}} />);

    await waitFor(() =>
      assert.ok(screen.getByText(/None are enabled yet/i))
    );

    assert.ok(screen.getByText(/LibGen, Anna's Archive and Z-Library/));
    assert.ok(screen.getByRole('link', { name: /Settings.*Download Sources/i }));
    assert.strictEqual(mockSearchDownloads.mock.callCount(), 0);
  });

  it('searches normally once a shadow library source is enabled', async () => {
    mockGetDownloadConfigs.mock.mockImplementation(async () => [
      { source: 'libgen', enabled: 1 },
    ]);

    render(<DownloadSourcesModal book={book} onClose={() => {}} />);

    await waitFor(() => assert.strictEqual(mockSearchDownloads.mock.callCount(), 1));
    assert.strictEqual(screen.queryByText(/None are enabled yet/i), null);
  });
});
