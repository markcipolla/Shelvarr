jest.mock('../../src/services/fileManager', () => ({
  downloadBookFile: jest.fn(),
  extractComicArchive: jest.fn(),
}));

jest.mock('../../src/services/api/comics', () => ({
  getComicIssueFileUrl: jest.fn().mockReturnValue('http://server/api/comics/issues/7/file'),
}));

import { prepareComicForReading } from '../../src/services/comicReader';
import { downloadBookFile, extractComicArchive } from '../../src/services/fileManager';
import { getComicIssueFileUrl } from '../../src/services/api/comics';
import type { KapowarrIssue } from '@shelvarr/types';

const mockDownload = downloadBookFile as jest.Mock;
const mockExtract = extractComicArchive as jest.Mock;

function makeIssue(filepath: string): KapowarrIssue {
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
    files: [{ id: 1, filepath, size: 1000 }],
  };
}

beforeEach(() => {
  jest.clearAllMocks();
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
});
