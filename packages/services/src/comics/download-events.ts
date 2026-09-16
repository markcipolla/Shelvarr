/**
 * Comic download mutations that announce themselves.
 *
 * These wrap the plain database writes so the downloads page can follow a
 * transfer without polling. Everything that changes a download during normal
 * operation goes through here rather than calling the database directly —
 * that way a new call site gets the live update without having to remember to
 * publish one.
 */

import {
  addComicDownload,
  deferComicDownload,
  deleteComicDownload,
  getComicDownload,
  resetComicDownloadForRetry,
  setComicDownloadState,
  switchComicDownloadLink,
  updateComicDownloadProgress,
} from '@shelvarr/db';
import type { AddComicDownloadInput } from '@shelvarr/db';
import type {
  ComicDownload,
  ComicDownloadLink,
  ComicDownloadState,
} from '@shelvarr/types';
import { listenerCount, publish } from '../events/index';

/**
 * Record a state change and tell anything watching.
 *
 * The row is read back afterwards so the event carries the error and volume
 * the database actually ended up with, rather than what the caller passed —
 * `setComicDownloadState` merges some fields instead of overwriting them.
 */
export function setDownloadState(
  id: number,
  state: ComicDownloadState,
  extra: { error?: string | null; filePath?: string | null } = {}
): void {
  setComicDownloadState(id, state, extra);

  if (listenerCount() === 0) return;

  const row = getComicDownload(id);
  publish({
    kind: 'download',
    event: 'state',
    id,
    volumeId: row?.volumeId ?? null,
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
 * numbers it was handed instead of reading the row back. The volume is left
 * out for the same reason: a progress bar is redrawn in place and the page
 * already knows which volume the row belongs to.
 */
export function setDownloadProgress(
  id: number,
  progress: number,
  size: number | null
): void {
  updateComicDownloadProgress(id, progress, size);

  if (listenerCount() === 0) return;

  publish({
    kind: 'download',
    event: 'progress',
    id,
    volumeId: null,
    state: 'downloading',
    progress,
    size,
  });
}

/**
 * Queue a new download and tell anything watching, so a downloads page that
 * is already open grows the row rather than waiting to be reloaded.
 */
export function addDownload(input: AddComicDownloadInput): ComicDownload {
  const download = addComicDownload(input);
  announceDownload(download.id, 'state');
  return download;
}

/** Put a rate-limited download back in the queue for later. */
export function deferDownload(id: number, error: string): void {
  deferComicDownload(id, error);
  announceDownload(id, 'state');
}

/** Move a download onto one of the article's other links. */
export function switchDownloadLink(
  id: number,
  next: ComicDownloadLink,
  remaining: ComicDownloadLink[]
): void {
  switchComicDownloadLink(id, next, remaining);
  announceDownload(id, 'state');
}

/** Clear a failed download's error and put it back in the queue. */
export function resetDownloadForRetry(id: number): void {
  resetComicDownloadForRetry(id);
  announceDownload(id, 'state');
}

/**
 * Drop a download from the queue.
 *
 * The event is built before the delete, because afterwards there is no row to
 * describe — and a page needs to know which volume lost a download, not just
 * that some id went away.
 */
export function removeDownload(id: number): boolean {
  const row = getComicDownload(id);
  const removed = deleteComicDownload(id);

  if (removed && listenerCount() > 0) {
    publish({
      kind: 'download',
      event: 'removed',
      id,
      volumeId: row?.volumeId ?? null,
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

  const row = getComicDownload(id);
  if (!row) return;

  publish({
    kind: 'download',
    event,
    id,
    volumeId: row.volumeId,
    state: row.state,
    progress: row.progress,
    size: row.size,
    error: row.error,
  });
}
