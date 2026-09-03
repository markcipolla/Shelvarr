/**
 * The slice of the library this device can serve with no network.
 *
 * Downloaded files are tracked in the two download manifests rather than in
 * the metadata mirror, so offline fallbacks read from there: a file on disk is
 * readable whether or not the library list can be fetched. The manifest is
 * passed in rather than read from the store so these stay pure — screens hand
 * over the slice they already subscribe to.
 */
import type { Book, DownloadedBook } from '../types/api';
import type { ComicVolumeSummary } from '@shelvarr/types';
import type { DownloadedComic } from '../stores/useComicDownloadStore';

/**
 * Books whose file is on this device, newest download first. Includes books
 * cached by opening them, not just explicit downloads — both are readable
 * offline. Entries without cached metadata are skipped: there is no card to
 * render for them.
 */
export function listDownloadedBooks(downloads: Record<string, DownloadedBook>): Book[] {
  return Object.values(downloads)
    .filter((d) => !!d.book)
    .sort((a, b) => b.downloadedAt - a.downloadedAt)
    .map((d) => d.book as Book);
}

/** Everything a downloaded book can be matched on, lowercased. */
function bookHaystack(book: Book): string {
  const authors = (book.metadata?.authors ?? []).map((a) => a.name);
  return [book.metadata?.title, book.name, book.seriesId, ...authors]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

/**
 * Substring search over downloaded books — title, file name, series and
 * authors. Stands in for the server's search while offline, so it is
 * deliberately forgiving rather than ranked.
 */
export function searchDownloadedBooks(
  downloads: Record<string, DownloadedBook>,
  query: string
): Book[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return [];
  return listDownloadedBooks(downloads).filter((book) => bookHaystack(book).includes(needle));
}

/**
 * A stand-in summary for a volume that has downloaded issues but no cached
 * metadata. Carries only what a card renders; the counts stay at zero so the
 * card doesn't claim a download progress it can't know.
 */
function placeholderVolume(id: number, title: string): ComicVolumeSummary {
  return {
    id,
    comicvine_id: 0,
    title,
    year: null,
    publisher: null,
    volume_number: 0,
    description: '',
    monitored: false,
    monitor_new_issues: false,
    folder: '',
    issue_count: 0,
    issue_count_monitored: 0,
    issues_downloaded: 0,
    issues_downloaded_monitored: 0,
    total_size: null,
  };
}

/**
 * Volumes with at least one issue downloaded to this device, newest download
 * first. `query` filters by title, matching the offline search fallback.
 */
export function listDownloadedComicVolumes(
  downloads: Record<number, DownloadedComic>,
  query = ''
): ComicVolumeSummary[] {
  const needle = query.trim().toLowerCase();
  const byVolume = new Map<number, ComicVolumeSummary>();

  for (const download of Object.values(downloads).sort((a, b) => b.downloadedAt - a.downloadedAt)) {
    if (byVolume.has(download.volumeId)) continue;
    const title = download.volumeTitle || `Volume ${download.volumeId}`;
    if (needle && !title.toLowerCase().includes(needle)) continue;
    byVolume.set(download.volumeId, placeholderVolume(download.volumeId, title));
  }

  return Array.from(byVolume.values());
}

/**
 * Append downloaded volumes that the given list is missing. Used on the
 * offline paths so an issue on disk is always reachable from the index, even
 * if its volume never made it into the metadata cache.
 */
export function withDownloadedComicVolumes(
  volumes: ComicVolumeSummary[],
  downloads: Record<number, DownloadedComic>,
  query = ''
): ComicVolumeSummary[] {
  const listed = new Set(volumes.map((v) => v.id));
  const missing = listDownloadedComicVolumes(downloads, query).filter((v) => !listed.has(v.id));
  return missing.length > 0 ? [...volumes, ...missing] : volumes;
}
