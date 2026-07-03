import type { KapowarrIssue } from '@shelvarr/types';
import { getInfoAsync, readDirectoryAsync } from 'expo-file-system/legacy';
import { getFormatFromName } from '../utils/fileTypes';
import { downloadBookFile, extractComicArchive, deleteBookFiles, DownloadHttpError } from './fileManager';
import { getComicIssueFileUrl } from './api/comics';
import { useComicDownloadStore, DownloadedComic } from '../stores/useComicDownloadStore';

export type ComicReadResult =
  | { kind: 'pdf'; filePath: string }
  | { kind: 'images'; extractedDir: string; totalPages: number };

const IMAGE_RE = /\.(jpe?g|png|gif|webp)$/i;

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

/**
 * Return an already-downloaded copy when this device still has its files on
 * disk, otherwise null so the caller re-downloads.
 */
async function reuseExistingDownload(
  existing: DownloadedComic | undefined
): Promise<ComicReadResult | null> {
  if (!existing) return null;

  if (existing.kind === 'pdf') {
    if (!existing.filePath) return null;
    const info = await getInfoAsync(existing.filePath);
    return info.exists ? { kind: 'pdf', filePath: existing.filePath } : null;
  }

  if (!existing.extractedDir || !existing.totalPages) return null;
  const info = await getInfoAsync(existing.extractedDir);
  if (!info.exists) return null;
  const files = await readDirectoryAsync(existing.extractedDir);
  const images = files.filter((f) => IMAGE_RE.test(f));
  return images.length >= existing.totalPages
    ? { kind: 'images', extractedDir: existing.extractedDir, totalPages: existing.totalPages }
    : null;
}

/**
 * Reuse an already-downloaded copy on this device when its files are still on
 * disk, otherwise download (and, for archives, extract) the issue afresh.
 */
async function ensureComicDownloaded(
  issue: KapowarrIssue,
  headers: Record<string, string>,
  onProgress?: (progress: number) => void
): Promise<ComicReadResult> {
  const cached = await reuseExistingDownload(useComicDownloadStore.getState().downloads[issue.id]);
  if (cached) return cached;

  const key = `comic-${issue.id}`;
  const format = getFormatFromName(issue.files[0]?.filepath ?? '');
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

/** Record a downloaded issue in the per-device manifest. */
function recordComicDownload(
  issue: KapowarrIssue,
  result: ComicReadResult,
  persisted: boolean,
  volumeTitle?: string
): DownloadedComic {
  const store = useComicDownloadStore.getState();
  const existing = store.downloads[issue.id];
  const download: DownloadedComic = {
    issueId: issue.id,
    volumeId: issue.volume_id,
    kind: result.kind,
    filePath: result.kind === 'pdf' ? result.filePath : undefined,
    extractedDir: result.kind === 'images' ? result.extractedDir : undefined,
    totalPages: result.kind === 'images' ? result.totalPages : undefined,
    downloadedAt: existing?.downloadedAt ?? Date.now(),
    persisted: persisted || existing?.persisted || false,
    issue,
    volumeTitle: volumeTitle ?? existing?.volumeTitle,
  };
  store.setDownload(issue.id, download);
  return download;
}

/** Download (if needed) and cache an issue so the reader can open it. */
export async function prepareComicForReading(
  issue: KapowarrIssue,
  headers: Record<string, string>,
  onProgress?: (progress: number) => void,
  volumeTitle?: string
): Promise<ComicReadResult> {
  const result = await ensureComicDownloaded(issue, headers, onProgress);
  recordComicDownload(issue, result, false, volumeTitle);
  return result;
}

/** Explicitly download an issue for offline reading and keep it (persisted). */
export async function downloadComic(
  issue: KapowarrIssue,
  headers: Record<string, string>,
  volumeTitle?: string
): Promise<DownloadedComic> {
  const store = useComicDownloadStore.getState();
  store.setActiveDownload(issue.id, 0);
  try {
    const result = await ensureComicDownloaded(issue, headers, (progress) =>
      store.setActiveDownload(issue.id, progress)
    );
    store.setActiveDownload(null);
    return recordComicDownload(issue, result, true, volumeTitle);
  } catch (err) {
    store.setActiveDownload(null);
    throw err;
  }
}

/** Delete an issue's local files and forget it in the manifest. */
export async function removeDownloadedComic(issueId: number): Promise<void> {
  const store = useComicDownloadStore.getState();
  const existing = store.downloads[issueId];
  if (!existing) return;
  await deleteBookFiles(`comic-${issueId}`, existing.kind === 'pdf' ? '.pdf' : '.cbz');
  store.removeDownload(issueId);
}
