import type { KapowarrIssue } from '@shelvarr/types';
import { getFormatFromName } from '../utils/fileTypes';
import { downloadBookFile, extractComicArchive, DownloadHttpError } from './fileManager';
import { getComicIssueFileUrl } from './api/comics';

export type ComicReadResult =
  | { kind: 'pdf'; filePath: string }
  | { kind: 'images'; extractedDir: string; totalPages: number };

/**
 * Translate a prepare-for-reading failure into a user-friendly, actionable
 * message. Falls back to the raw error text for anything unrecognised.
 */
export function describeComicReadError(err: unknown): string {
  if (err instanceof DownloadHttpError) {
    const detail = err.detail.toLowerCase();
    switch (err.status) {
      case 401:
      case 403:
        return 'Your session has expired. Please sign in to Shelvarr again.';
      case 404:
        if (/no file|not downloaded|no such file|enoent|not found on disk/.test(detail)) {
          return "This issue's file isn't available on the server yet. Make sure Kapowarr has downloaded it and that your Shelvarr server can reach Kapowarr's files.";
        }
        return "This comic couldn't be found on the server.";
      case 503:
        return 'Kapowarr is not configured on your Shelvarr server.';
      default:
        if (err.status >= 500) {
          return `The Shelvarr server had a problem preparing this comic (error ${err.status}). Please try again.`;
        }
        return err.detail || `The server returned an error (${err.status}).`;
    }
  }

  const message = err instanceof Error ? err.message : String(err);
  if (/network|timeout|timed out|connection|fetch failed|unreachable/i.test(message)) {
    return "Couldn't reach your Shelvarr server. Check your connection and that the server is running.";
  }
  if (/unsupported comic format/i.test(message)) {
    return "This comic's file format isn't supported for reading.";
  }
  if (/(corrupt|invalid|end of central directory|zip)/i.test(message)) {
    return 'The downloaded comic file appears to be corrupted. Please try again.';
  }
  return message || 'Something went wrong while preparing this comic.';
}

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
