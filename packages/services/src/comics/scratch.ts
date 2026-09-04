/**
 * Keep the download scratch directory from growing without bound.
 *
 * In-flight downloads are written to `<downloadDir>/<downloadId>-<filename>`
 * and moved into the library on import, so a run that finishes cleanly leaves
 * nothing behind. Anything else does: a cancelled download abandons its
 * partial file, and one that fails to import keeps the bytes it fetched.
 *
 * Keeping a failed download's file is deliberate — retrying resumes from it
 * instead of pulling the whole issue again, which is what makes "fix the
 * permissions, press Retry" cheap. It only becomes litter once nobody is going
 * to press Retry, so failures are swept on a delay rather than at once.
 */

import { existsSync, readdirSync, statSync, unlinkSync } from 'fs';
import { join } from 'path';

import { getComicDownload } from '@shelvarr/db';

import { getServiceConfig } from '../config';
import { createLogger } from '../utils/logger';

const log = createLogger('comics-scratch');

/** How long a failed download's bytes are kept in case it gets retried. */
export const DEFAULT_KEEP_FAILED_HOURS = 48;

/** `123-Some Comic 001.cbz` — the download id the file belongs to. */
const SCRATCH_NAME = /^(\d+)-/;

export interface ScratchSweepResult {
  /** Files deleted. */
  removed: string[];
  /** Bytes reclaimed. */
  bytes: number;
  /** Files left alone because a download may still want them. */
  kept: number;
}

/**
 * Whether a scratch file can go.
 *
 * Only files named for a download are considered at all: the scratch directory
 * is configurable, so it may be somewhere with other things in it, and deleting
 * a stranger's file would be worse than leaving litter.
 */
function isDisposable(filename: string, keepFailedHours: number): boolean {
  const id = SCRATCH_NAME.exec(filename)?.[1];
  if (!id) return false;

  const download = getComicDownload(Number(id));
  // The download was deleted from the queue; nothing can want this.
  if (!download) return true;

  switch (download.state) {
    case 'queued':
    case 'downloading':
    case 'importing':
      // Live, or about to be picked up by the resume sweep.
      return false;
    case 'completed':
      // The file was moved into the library; anything left is a leftover.
      return true;
    case 'cancelled':
      // Deliberately abandoned, and Retry starts over rather than resuming.
      return true;
    case 'failed': {
      if (!download.completedAt) return true;
      const failedAt = new Date(`${download.completedAt.replace(' ', 'T')}Z`).getTime();
      if (Number.isNaN(failedAt)) return true;
      return Date.now() - failedAt > keepFailedHours * 60 * 60 * 1000;
    }
  }
}

/**
 * Delete scratch files no download can still use.
 *
 * Safe to run while downloads are in flight: a file is only removed once the
 * download it belongs to has stopped for good.
 */
export function sweepComicScratch(
  options: { keepFailedHours?: number } = {}
): ScratchSweepResult {
  const keepFailedHours = options.keepFailedHours ?? DEFAULT_KEEP_FAILED_HOURS;
  const directory = getServiceConfig().getcomics.downloadDir;
  const result: ScratchSweepResult = { removed: [], bytes: 0, kept: 0 };

  if (!existsSync(directory)) return result;

  for (const filename of readdirSync(directory)) {
    if (!isDisposable(filename, keepFailedHours)) {
      result.kept += 1;
      continue;
    }

    const path = join(directory, filename);
    try {
      const { size } = statSync(path);
      unlinkSync(path);
      result.removed.push(filename);
      result.bytes += size;
    } catch (error) {
      // Someone else got there first, or we cannot write here — either way the
      // sweep is housekeeping, not something to fail a task over.
      log.warn('Could not remove scratch file', { path, error: String(error) });
    }
  }

  if (result.removed.length > 0) {
    log.info('Swept download scratch', {
      removed: result.removed.length,
      bytes: result.bytes,
      kept: result.kept,
    });
  }

  return result;
}
