import type { KapowarrIssue } from '@shelvarr/types';
import { getFormatFromName } from '../utils/fileTypes';
import { downloadBookFile, extractComicArchive } from './fileManager';
import { getComicIssueFileUrl } from './api/comics';

export type ComicReadResult =
  | { kind: 'pdf'; filePath: string }
  | { kind: 'images'; extractedDir: string; totalPages: number };

export async function prepareComicForReading(
  issue: KapowarrIssue,
  headers: Record<string, string>,
  onProgress?: (progress: number) => void
): Promise<ComicReadResult> {
  const filePath = issue.files[0]?.filepath ?? '';
  const format = getFormatFromName(filePath);
  const key = `comic-${issue.id}`;

  if (format === 'pdf') {
    const downloadedPath = await downloadBookFile(
      getComicIssueFileUrl(issue.id),
      key,
      '.pdf',
      headers,
      onProgress
    );
    return { kind: 'pdf', filePath: downloadedPath };
  }

  // cbz/cbr: server normalises to ZIP; save as .cbz and extract
  const downloadedPath = await downloadBookFile(
    getComicIssueFileUrl(issue.id),
    key,
    '.cbz',
    headers,
    onProgress
  );
  const { dir, pageCount } = await extractComicArchive(downloadedPath, key);
  return { kind: 'images', extractedDir: dir, totalPages: pageCount };
}
