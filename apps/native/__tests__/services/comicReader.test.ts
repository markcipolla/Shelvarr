jest.mock('../../src/services/fileManager', () => {
  class DownloadHttpError extends Error {
    status: number;
    detail: string;
    constructor(status: number, detail: string) {
      super(`Server returned ${status}${detail ? `: ${detail}` : ''}`);
      this.name = 'DownloadHttpError';
      this.status = status;
      this.detail = detail;
    }
  }
  return {
    downloadBookFile: jest.fn(),
    extractComicArchive: jest.fn(),
    deleteBookFiles: jest.fn(),
    DownloadHttpError,
  };
});

jest.mock('../../src/services/api/comics', () => ({
  getComicIssueFileUrl: jest.fn().mockReturnValue('http://server/api/comics/issues/7/file'),
}));

import {
  prepareComicForReading,
  downloadComic,
  removeDownloadedComic,
  describeComicReadError,
} from '../../src/services/comicReader';
import {
  downloadBookFile,
  extractComicArchive,
  deleteBookFiles,
  DownloadHttpError,
} from '../../src/services/fileManager';
import { getComicIssueFileUrl } from '../../src/services/api/comics';
import { getInfoAsync, readDirectoryAsync } from 'expo-file-system/legacy';
import { useComicDownloadStore } from '../../src/stores/useComicDownloadStore';
import type { ComicIssueSummary } from '@shelvarr/types';

const mockDownload = downloadBookFile as jest.Mock;
const mockExtract = extractComicArchive as jest.Mock;
const mockDelete = deleteBookFiles as jest.Mock;
const mockGetInfo = getInfoAsync as jest.Mock;
const mockReadDir = readDirectoryAsync as jest.Mock;

function makeIssue(filepath: string, overrides: Partial<ComicIssueSummary> = {}): ComicIssueSummary {
  return {
    id: 7,
    volume_id: 1,
    comicvine_id: 1,
    issue_number: '1',
    calculated_issue_number: 1,
    title: 'Test',
    date: null,
    description: '',
    monitored: true,
    files: filepath ? [{ id: 1, filepath, size: 1000 }] : [],
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  useComicDownloadStore.setState({ downloads: {}, activeIssueId: null, progress: 0, hydrated: false });
  mockGetInfo.mockResolvedValue({ exists: false });
  mockReadDir.mockResolvedValue([]);
});

describe('prepareComicForReading', () => {
  it('returns pdf result for .pdf files', async () => {
    mockDownload.mockResolvedValue('/local/comic-7.pdf');
    const issue = makeIssue('/server/path/issue.pdf');
    const headers = { Authorization: 'Basic abc' };

    const result = await prepareComicForReading(issue, headers);

    expect(mockDownload).toHaveBeenCalledWith(
      'http://server/api/comics/issues/7/file',
      'comic-7',
      '.pdf',
      headers,
      undefined
    );
    expect(result).toEqual({ kind: 'pdf', filePath: '/local/comic-7.pdf' });
    expect(mockExtract).not.toHaveBeenCalled();
    // Records the download in the per-device manifest.
    expect(useComicDownloadStore.getState().downloads[7]).toMatchObject({
      issueId: 7,
      volumeId: 1,
      kind: 'pdf',
      filePath: '/local/comic-7.pdf',
      persisted: false,
    });
  });

  it('returns images result for .cbz files', async () => {
    mockDownload.mockResolvedValue('/local/comic-7.cbz');
    mockExtract.mockResolvedValue({ dir: '/extracted/comic-7/', pageCount: 22 });
    const issue = makeIssue('/server/path/issue.cbz');
    const headers = { Authorization: 'Basic abc' };

    const result = await prepareComicForReading(issue, headers);

    expect(mockDownload).toHaveBeenCalledWith(
      'http://server/api/comics/issues/7/file',
      'comic-7',
      '.cbz',
      headers,
      undefined
    );
    expect(mockExtract).toHaveBeenCalledWith('/local/comic-7.cbz', 'comic-7');
    expect(result).toEqual({
      kind: 'images',
      extractedDir: '/extracted/comic-7/',
      totalPages: 22,
    });
    expect(useComicDownloadStore.getState().downloads[7]).toMatchObject({
      kind: 'images',
      extractedDir: '/extracted/comic-7/',
      totalPages: 22,
    });
  });

  it('returns images result for .cbr files (server normalises to zip)', async () => {
    mockDownload.mockResolvedValue('/local/comic-7.cbz');
    mockExtract.mockResolvedValue({ dir: '/extracted/comic-7/', pageCount: 10 });
    const issue = makeIssue('/server/path/issue.cbr');

    await prepareComicForReading(issue, {});

    expect(mockDownload).toHaveBeenCalledWith(
      expect.any(String),
      'comic-7',
      '.cbz',
      {},
      undefined
    );
  });

  it('treats an issue with no server file as an archive download', async () => {
    mockDownload.mockResolvedValue('/local/comic-7.cbz');
    mockExtract.mockResolvedValue({ dir: '/extracted/comic-7/', pageCount: 3 });
    const issue = makeIssue('');

    await prepareComicForReading(issue, {});

    expect(mockDownload).toHaveBeenCalledWith(expect.any(String), 'comic-7', '.cbz', {}, undefined);
  });

  it('passes onProgress callback through to downloadBookFile', async () => {
    mockDownload.mockResolvedValue('/local/comic-7.pdf');
    const issue = makeIssue('/server/path/issue.pdf');
    const onProgress = jest.fn();

    await prepareComicForReading(issue, {}, onProgress);

    expect(mockDownload).toHaveBeenCalledWith(
      expect.any(String),
      'comic-7',
      '.pdf',
      {},
      onProgress
    );
  });

  it('uses key comic-<issueId>', async () => {
    mockDownload.mockResolvedValue('/local/comic-7.pdf');
    const issue = makeIssue('/path/issue.pdf');

    await prepareComicForReading(issue, {});

    expect(getComicIssueFileUrl).toHaveBeenCalledWith(7);
    expect(mockDownload).toHaveBeenCalledWith(
      expect.any(String),
      'comic-7',
      expect.any(String),
      expect.any(Object),
      undefined
    );
  });

  it('preserves persisted flag, downloadedAt, and volumeTitle when re-recording', async () => {
    // First download explicitly (persisted, with a title).
    mockDownload.mockResolvedValue('/local/comic-7.pdf');
    await downloadComic(makeIssue('/server/path/issue.pdf'), {}, 'Batman');
    const first = useComicDownloadStore.getState().downloads[7];
    expect(first.persisted).toBe(true);

    // Then a plain read-and-cache must keep it persisted with the same metadata.
    mockGetInfo.mockResolvedValue({ exists: false });
    await prepareComicForReading(makeIssue('/server/path/issue.pdf'), {});
    const second = useComicDownloadStore.getState().downloads[7];
    expect(second.persisted).toBe(true);
    expect(second.downloadedAt).toBe(first.downloadedAt);
    expect(second.volumeTitle).toBe('Batman');
  });

  describe('reusing an existing download', () => {
    it('reads a cached pdf from disk without re-downloading', async () => {
      useComicDownloadStore.setState({
        downloads: {
          7: { issueId: 7, volumeId: 1, kind: 'pdf', filePath: '/local/comic-7.pdf', downloadedAt: 1 },
        },
      });
      mockGetInfo.mockResolvedValue({ exists: true });

      const result = await prepareComicForReading(makeIssue('/server/path/issue.pdf'), {});

      expect(result).toEqual({ kind: 'pdf', filePath: '/local/comic-7.pdf' });
      expect(mockDownload).not.toHaveBeenCalled();
    });

    it('re-downloads a pdf when its cached file is gone', async () => {
      useComicDownloadStore.setState({
        downloads: {
          7: { issueId: 7, volumeId: 1, kind: 'pdf', filePath: '/local/comic-7.pdf', downloadedAt: 1 },
        },
      });
      mockGetInfo.mockResolvedValue({ exists: false });
      mockDownload.mockResolvedValue('/local/comic-7.pdf');

      await prepareComicForReading(makeIssue('/server/path/issue.pdf'), {});
      expect(mockDownload).toHaveBeenCalled();
    });

    it('re-downloads a pdf entry that has no stored filePath', async () => {
      useComicDownloadStore.setState({
        downloads: { 7: { issueId: 7, volumeId: 1, kind: 'pdf', downloadedAt: 1 } },
      });
      mockDownload.mockResolvedValue('/local/comic-7.pdf');

      await prepareComicForReading(makeIssue('/server/path/issue.pdf'), {});
      expect(mockDownload).toHaveBeenCalled();
    });

    it('reads cached images from disk when enough pages are present', async () => {
      useComicDownloadStore.setState({
        downloads: {
          7: {
            issueId: 7,
            volumeId: 1,
            kind: 'images',
            extractedDir: '/extracted/comic-7/',
            totalPages: 2,
            downloadedAt: 1,
          },
        },
      });
      mockGetInfo.mockResolvedValue({ exists: true });
      mockReadDir.mockResolvedValue(['00000.jpg', '00001.jpg']);

      const result = await prepareComicForReading(makeIssue('/server/path/issue.cbz'), {});

      expect(result).toEqual({
        kind: 'images',
        extractedDir: '/extracted/comic-7/',
        totalPages: 2,
      });
      expect(mockDownload).not.toHaveBeenCalled();
    });

    it('re-downloads images when the extracted directory is gone', async () => {
      useComicDownloadStore.setState({
        downloads: {
          7: {
            issueId: 7, volumeId: 1, kind: 'images',
            extractedDir: '/extracted/comic-7/', totalPages: 2, downloadedAt: 1,
          },
        },
      });
      mockGetInfo.mockResolvedValue({ exists: false });
      mockDownload.mockResolvedValue('/local/comic-7.cbz');
      mockExtract.mockResolvedValue({ dir: '/extracted/comic-7/', pageCount: 2 });

      await prepareComicForReading(makeIssue('/server/path/issue.cbz'), {});
      expect(mockDownload).toHaveBeenCalled();
    });

    it('re-downloads images when too few pages are on disk', async () => {
      useComicDownloadStore.setState({
        downloads: {
          7: {
            issueId: 7, volumeId: 1, kind: 'images',
            extractedDir: '/extracted/comic-7/', totalPages: 5, downloadedAt: 1,
          },
        },
      });
      mockGetInfo.mockResolvedValue({ exists: true });
      mockReadDir.mockResolvedValue(['00000.jpg']);
      mockDownload.mockResolvedValue('/local/comic-7.cbz');
      mockExtract.mockResolvedValue({ dir: '/extracted/comic-7/', pageCount: 5 });

      await prepareComicForReading(makeIssue('/server/path/issue.cbz'), {});
      expect(mockDownload).toHaveBeenCalled();
    });

    it('re-downloads an images entry missing its extracted directory', async () => {
      useComicDownloadStore.setState({
        downloads: { 7: { issueId: 7, volumeId: 1, kind: 'images', totalPages: 2, downloadedAt: 1 } },
      });
      mockDownload.mockResolvedValue('/local/comic-7.cbz');
      mockExtract.mockResolvedValue({ dir: '/extracted/comic-7/', pageCount: 2 });

      await prepareComicForReading(makeIssue('/server/path/issue.cbz'), {});
      expect(mockDownload).toHaveBeenCalled();
    });

    it('re-downloads an images entry missing its page count', async () => {
      useComicDownloadStore.setState({
        downloads: {
          7: { issueId: 7, volumeId: 1, kind: 'images', extractedDir: '/extracted/comic-7/', downloadedAt: 1 },
        },
      });
      mockDownload.mockResolvedValue('/local/comic-7.cbz');
      mockExtract.mockResolvedValue({ dir: '/extracted/comic-7/', pageCount: 2 });

      await prepareComicForReading(makeIssue('/server/path/issue.cbz'), {});
      expect(mockDownload).toHaveBeenCalled();
    });
  });
});

describe('downloadComic', () => {
  it('downloads, records a persisted entry, and clears active progress', async () => {
    mockDownload.mockImplementation(async (_url, _key, _ext, _headers, onProgress) => {
      onProgress?.(0.5);
      return '/local/comic-7.pdf';
    });
    const issue = makeIssue('/server/path/issue.pdf');

    const result = await downloadComic(issue, {}, 'Batman');

    expect(result).toMatchObject({ issueId: 7, kind: 'pdf', persisted: true, volumeTitle: 'Batman' });
    expect(useComicDownloadStore.getState().downloads[7].persisted).toBe(true);
    expect(useComicDownloadStore.getState().activeIssueId).toBeNull();
  });

  it('clears active progress and rethrows on failure', async () => {
    mockDownload.mockRejectedValue(new DownloadHttpError(404, 'No file available for this issue'));
    const issue = makeIssue('/server/path/issue.pdf');

    await expect(downloadComic(issue, {})).rejects.toThrow(DownloadHttpError);
    expect(useComicDownloadStore.getState().activeIssueId).toBeNull();
    expect(useComicDownloadStore.getState().downloads[7]).toBeUndefined();
  });
});

describe('removeDownloadedComic', () => {
  it('deletes a downloaded pdf and forgets it', async () => {
    useComicDownloadStore.setState({
      downloads: {
        7: { issueId: 7, volumeId: 1, kind: 'pdf', filePath: '/local/comic-7.pdf', downloadedAt: 1 },
      },
    });

    await removeDownloadedComic(7);

    expect(mockDelete).toHaveBeenCalledWith('comic-7', '.pdf');
    expect(useComicDownloadStore.getState().downloads[7]).toBeUndefined();
  });

  it('deletes a downloaded archive as .cbz', async () => {
    useComicDownloadStore.setState({
      downloads: {
        7: { issueId: 7, volumeId: 1, kind: 'images', extractedDir: '/e/', totalPages: 2, downloadedAt: 1 },
      },
    });

    await removeDownloadedComic(7);
    expect(mockDelete).toHaveBeenCalledWith('comic-7', '.cbz');
  });

  it('does nothing when the issue was never downloaded', async () => {
    await removeDownloadedComic(999);
    expect(mockDelete).not.toHaveBeenCalled();
  });
});

describe('describeComicReadError', () => {
  it('explains an expired session for 401/403', () => {
    expect(describeComicReadError(new DownloadHttpError(401, 'Unauthorized'))).toMatch(
      /sign in/i
    );
    expect(describeComicReadError(new DownloadHttpError(403, 'Forbidden'))).toMatch(/sign in/i);
  });

  it('explains a missing file on disk for 404 ENOENT', () => {
    const msg = describeComicReadError(
      new DownloadHttpError(404, "ENOENT: no such file or directory, stat '/media/x.cbz'")
    );
    expect(msg).toMatch(/isn't available on the server/i);
    expect(msg).toMatch(/has been downloaded/);
  });

  it('explains "no file available" for 404', () => {
    expect(
      describeComicReadError(new DownloadHttpError(404, 'No file available for this issue'))
    ).toMatch(/isn't available on the server/i);
  });

  it('reports a generic not-found for other 404s', () => {
    expect(describeComicReadError(new DownloadHttpError(404, 'weird thing'))).toMatch(
      /couldn't be found/i
    );
  });

  it('returns the server detail for other 4xx errors', () => {
    expect(describeComicReadError(new DownloadHttpError(400, 'bad request'))).toBe('bad request');
  });

  it('falls back to a generic message for a detail-less 4xx', () => {
    expect(describeComicReadError(new DownloadHttpError(400, ''))).toMatch(
      /returned an error \(400\)/i
    );
  });

  it('points to comic setup for 503', () => {
    expect(describeComicReadError(new DownloadHttpError(503, 'Comics not set up'))).toMatch(
      /not set up/i
    );
  });

  it('gives a generic server message for 5xx', () => {
    expect(describeComicReadError(new DownloadHttpError(500, 'boom'))).toMatch(/error 500/i);
  });

  it('detects network failures', () => {
    expect(describeComicReadError(new Error('Network request failed'))).toMatch(
      /reach your Shelvarr server/i
    );
  });

  it('detects corrupted archives', () => {
    expect(
      describeComicReadError(new Error('Error: end of central directory not found'))
    ).toMatch(/corrupted/i);
  });

  it('explains unsupported formats', () => {
    expect(describeComicReadError(new Error('Unsupported comic format: txt'))).toMatch(
      /isn't supported/i
    );
  });

  it('falls back to the raw message for unknown errors', () => {
    expect(describeComicReadError(new Error('something odd'))).toBe('something odd');
  });

  it('uses a generic message when the error has no text', () => {
    expect(describeComicReadError(new Error(''))).toMatch(/something went wrong/i);
  });
});
