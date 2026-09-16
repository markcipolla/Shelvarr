/**
 * Book download mutations that announce themselves.
 *
 * Mirrors `comics/download-events.ts` for the `book_downloads` queue: these
 * wrap the plain database writes so the `/downloads` page can follow a
 * transfer without polling. `downloadHandler` calls these instead of the
 * plain `@shelvarr/db` functions at the same points it used to, so a new call
 * site gets the live update without having to remember to publish one.
 */

import {
  deleteBookDownload,
  getBookDownload,
  resetBookDownloadForRetry,
  setBookDownloadState,
  updateBookDownloadProgress,
} from '@shelvarr/db';
import type { BookDownloadState } from '@shelvarr/types';
import { listenerCount, publish } from '../events/index';

/**
 * Record a state change and tell anything watching.
 *
 * The row is read back afterwards so the event carries the error the
 * database actually ended up with, rather than what the caller passed —
 * `setBookDownloadState` merges some fields instead of overwriting them.
 */
export function setDownloadState(
  id: number,
  state: BookDownloadState,
  extra: { error?: string | null; filePath?: string | null; bookId?: number | null } = {}
): void {
  setBookDownloadState(id, state, extra);

  if (listenerCount() === 0) return;

  const row = getBookDownload(id);
  publish({
    kind: 'download',
    event: 'state',
    id,
    mediaType: 'book',
    volumeId: null,
    state: row?.state ?? state,
    progress: row?.progress ?? 0,
    size: row?.size ?? null,
    error: row?.error ?? extra.error ?? null,
  });
}

/**
 * Record bytes transferred and tell anything watching.
 *
 * Unlike the state change this fires throughout a download, so it reports the
 * numbers it was handed instead of reading the row back — same reasoning as
 * the comic equivalent.
 */
export function setDownloadProgress(id: number, progress: number, size: number | null): void {
  updateBookDownloadProgress(id, progress, size);

  if (listenerCount() === 0) return;

  publish({
    kind: 'download',
    event: 'progress',
    id,
    mediaType: 'book',
    volumeId: null,
    state: 'downloading',
    progress,
    size,
  });
}

/** Clear a failed download's error and put it back in the queue. */
export function resetDownloadForRetry(id: number): void {
  resetBookDownloadForRetry(id);
  announceDownload(id, 'state');
}

/**
 * Drop a download from the queue.
 *
 * The event is built before the delete, because afterwards there is no row
 * left to describe.
 */
export function removeDownload(id: number): boolean {
  const row = getBookDownload(id);
  const removed = deleteBookDownload(id);

  if (removed && listenerCount() > 0) {
    publish({
      kind: 'download',
      event: 'removed',
      id,
      mediaType: 'book',
      volumeId: null,
      state: row?.state ?? 'cancelled',
      progress: row?.progress ?? 0,
      size: row?.size ?? null,
    });
  }

  return removed;
}

/** Read a download back and publish what it now says. */
function announceDownload(id: number, event: 'state'): void {
  if (listenerCount() === 0) return;

  const row = getBookDownload(id);
  if (!row) return;

  publish({
    kind: 'download',
    event,
    id,
    mediaType: 'book',
    volumeId: null,
    state: row.state,
    progress: row.progress,
    size: row.size,
    error: row.error,
  });
}
