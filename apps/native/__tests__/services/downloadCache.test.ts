jest.mock('../../src/services/downloadManager', () => ({
  removeDownloadedBook: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../../src/services/comicReader', () => ({
  removeDownloadedComic: jest.fn().mockResolvedValue(undefined),
}));

import { sweepExpiredDownloads } from '../../src/services/downloadCache';
import { removeDownloadedBook } from '../../src/services/downloadManager';
import { removeDownloadedComic } from '../../src/services/comicReader';
import { useDownloadStore } from '../../src/stores/useDownloadStore';
import { useComicDownloadStore } from '../../src/stores/useComicDownloadStore';
import { useSettingsStore } from '../../src/stores/useSettingsStore';
import { DOWNLOAD_RETENTION_MS } from '../../src/utils/constants';
import type { DownloadedBook } from '../../src/types/api';
import type { DownloadedComic } from '../../src/stores/useComicDownloadStore';

const mockRemoveBook = removeDownloadedBook as jest.Mock;
const mockRemoveComic = removeDownloadedComic as jest.Mock;

const NOW = 1_800_000_000_000;
const LONG_AGO = NOW - DOWNLOAD_RETENTION_MS - 1;
const YESTERDAY = NOW - 24 * 60 * 60 * 1000;

function book(bookId: string, extra: Partial<DownloadedBook> = {}): DownloadedBook {
  return {
    bookId,
    filePath: `/downloads/${bookId}.epub`,
    format: 'epub',
    downloadedAt: LONG_AGO,
    ...extra,
  };
}

function comic(issueId: number, extra: Partial<DownloadedComic> = {}): DownloadedComic {
  return { issueId, volumeId: 1, kind: 'pdf', downloadedAt: LONG_AGO, ...extra };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockRemoveBook.mockResolvedValue(undefined);
  mockRemoveComic.mockResolvedValue(undefined);
  useDownloadStore.setState({ downloads: {} });
  useComicDownloadStore.setState({ downloads: {} });
  useSettingsStore.setState({ autoDeleteOldDownloads: true });
});

describe('sweepExpiredDownloads', () => {
  it('deletes books and comics that have gone the whole window unread', async () => {
    useDownloadStore.setState({ downloads: { b1: book('b1') } });
    useComicDownloadStore.setState({ downloads: { 7: comic(7) } });

    const removed = await sweepExpiredDownloads(NOW);

    expect(mockRemoveBook).toHaveBeenCalledWith('b1');
    expect(mockRemoveComic).toHaveBeenCalledWith(7);
    expect(removed).toEqual({ books: ['b1'], comics: [7] });
  });

  it('keeps anything read inside the window', async () => {
    useDownloadStore.setState({
      downloads: { b1: book('b1', { lastReadAt: YESTERDAY }) },
    });
    useComicDownloadStore.setState({
      downloads: { 7: comic(7, { lastReadAt: YESTERDAY }) },
    });

    const removed = await sweepExpiredDownloads(NOW);

    expect(mockRemoveBook).not.toHaveBeenCalled();
    expect(mockRemoveComic).not.toHaveBeenCalled();
    expect(removed).toEqual({ books: [], comics: [] });
  });

  it('ages an unread download from when it was downloaded', async () => {
    // Downloaded long ago, never opened: still due.
    useDownloadStore.setState({ downloads: { b1: book('b1', { lastReadAt: undefined }) } });

    await sweepExpiredDownloads(NOW);

    expect(mockRemoveBook).toHaveBeenCalledWith('b1');
  });

  it('never deletes an explicit download, however old', async () => {
    useDownloadStore.setState({
      downloads: { b1: book('b1', { persisted: true, lastReadAt: LONG_AGO }) },
    });
    useComicDownloadStore.setState({
      downloads: { 7: comic(7, { persisted: true, lastReadAt: LONG_AGO }) },
    });

    await sweepExpiredDownloads(NOW);

    expect(mockRemoveBook).not.toHaveBeenCalled();
    expect(mockRemoveComic).not.toHaveBeenCalled();
  });

  it('does nothing when automatic cleanup is switched off', async () => {
    useSettingsStore.setState({ autoDeleteOldDownloads: false });
    useDownloadStore.setState({ downloads: { b1: book('b1') } });
    useComicDownloadStore.setState({ downloads: { 7: comic(7) } });

    const removed = await sweepExpiredDownloads(NOW);

    expect(mockRemoveBook).not.toHaveBeenCalled();
    expect(mockRemoveComic).not.toHaveBeenCalled();
    expect(removed).toEqual({ books: [], comics: [] });
  });

  it('carries on past an entry it cannot delete', async () => {
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    mockRemoveBook.mockRejectedValueOnce(new Error('file busy'));
    mockRemoveComic.mockRejectedValueOnce(new Error('file busy'));
    useDownloadStore.setState({ downloads: { b1: book('b1'), b2: book('b2') } });
    useComicDownloadStore.setState({ downloads: { 7: comic(7), 8: comic(8) } });

    const removed = await sweepExpiredDownloads(NOW);

    expect(mockRemoveBook).toHaveBeenCalledTimes(2);
    expect(mockRemoveComic).toHaveBeenCalledTimes(2);
    // Only what actually went is reported as removed.
    expect(removed).toEqual({ books: ['b2'], comics: [8] });
  });

  it('defaults to sweeping against the current time', async () => {
    useDownloadStore.setState({
      downloads: { b1: book('b1', { downloadedAt: Date.now() - DOWNLOAD_RETENTION_MS - 1 }) },
    });

    await sweepExpiredDownloads();

    expect(mockRemoveBook).toHaveBeenCalledWith('b1');
  });
});
