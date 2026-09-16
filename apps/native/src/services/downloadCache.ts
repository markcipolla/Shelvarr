/**
 * Expiry for files this device downloaded.
 *
 * Opening something caches it; the reader used to delete that cache the moment
 * you closed it, so picking a book back up meant downloading it again. Instead
 * the files stay and are swept here once they have gone
 * `DOWNLOAD_RETENTION_DAYS` without being read. Explicitly downloaded items
 * are never swept — that is what "download" means.
 */
import { DOWNLOAD_RETENTION_MS } from '../utils/constants';
import { useSettingsStore } from '../stores/useSettingsStore';
import { useDownloadStore } from '../stores/useDownloadStore';
import { useComicDownloadStore } from '../stores/useComicDownloadStore';
import { removeDownloadedBook } from './downloadManager';
import { removeDownloadedComic } from './comicReader';

export interface SweepResult {
  books: string[];
  comics: number[];
}

/** An entry is due once it has sat unread past the retention window. */
function isExpired(
  entry: { persisted?: boolean; lastReadAt?: number; downloadedAt: number },
  now: number
): boolean {
  if (entry.persisted) return false;
  // Never read since it was fetched: age it from the download instead.
  const lastTouched = entry.lastReadAt ?? entry.downloadedAt;
  return now - lastTouched >= DOWNLOAD_RETENTION_MS;
}

/**
 * Delete every cached book and comic that is past the retention window.
 * Returns what was removed. A failure on one entry doesn't stop the rest:
 * reclaiming space is best-effort, and the entry will come up again next
 * sweep.
 */
export async function sweepExpiredDownloads(now = Date.now()): Promise<SweepResult> {
  const removed: SweepResult = { books: [], comics: [] };
  if (!useSettingsStore.getState().autoDeleteOldDownloads) return removed;

  for (const download of Object.values(useDownloadStore.getState().downloads)) {
    if (!isExpired(download, now)) continue;
    try {
      await removeDownloadedBook(download.bookId);
      removed.books.push(download.bookId);
    } catch (err) {
      console.warn(`Failed to sweep book ${download.bookId}:`, err);
    }
  }

  for (const download of Object.values(useComicDownloadStore.getState().downloads)) {
    if (!isExpired(download, now)) continue;
    try {
      await removeDownloadedComic(download.issueId);
      removed.comics.push(download.issueId);
    } catch (err) {
      console.warn(`Failed to sweep comic issue ${download.issueId}:`, err);
    }
  }

  return removed;
}
