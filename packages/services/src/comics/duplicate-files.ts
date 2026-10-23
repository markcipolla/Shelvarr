/**
 * Find and remove redundant copies of a comic file.
 *
 * `uniquePath` never overwrites on import, so a file that arrives under a name
 * already taken is filed as `… (2)`, then `… (3)`. Where the bytes differ that
 * is the right call — two different releases collided on one name, and a
 * rename settles them. Where the bytes are the same it is the same file twice,
 * costing shelf space and nothing else, and the copy can go.
 *
 * Driven off the folder rather than `comic_files`, because a copy the scan
 * never managed to place has no row to find it by — which is exactly the
 * situation that produced most of them.
 */

import { createHash } from 'crypto';
import { createReadStream } from 'fs';
import { stat, unlink } from 'fs/promises';
import { basename, extname } from 'path';

import {
  deleteComicFile,
  getComicVolumeFolders,
  getDb,
  refreshComicVolumeStats,
  upsertComicFile,
} from '@shelvarr/db';

import { createLogger } from '../utils/logger';
import { listComicFiles } from './scan';

const log = createLogger('comics-duplicates');

/** The ` (2)`, ` (3)`… that `uniquePath` adds when a name is already taken. */
const COPY_SUFFIX = /\s\((\d+)\)$/;

export interface DuplicateComicFileGroup {
  volumeId: number;
  volumeTitle: string;
  /** The copy that stays, under the name closest to what a rename wants. */
  keep: string;
  /** The redundant copies, byte-for-byte identical to `keep`. */
  remove: string[];
  /** Bytes one copy takes, and so what each removal frees. */
  bytes: number;
}

/**
 * Which copy to keep: the one whose name carries no `(n)` suffix, since that
 * is the name the import wanted and the one a rename will leave alone.
 */
function copyRank(path: string): number {
  const stem = basename(path, extname(path));
  const match = COPY_SUFFIX.exec(stem);
  return match ? parseInt(match[1]!, 10) : 0;
}

async function hashFile(path: string): Promise<string> {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path)) {
    hash.update(chunk as Buffer);
  }
  return hash.digest('hex');
}

/**
 * Group a volume's files by size, then confirm identity by hash.
 *
 * Two files of the same size are only a candidate pair — hashing every file in
 * an 800-volume library to find the handful that repeat would read hundreds of
 * gigabytes, and same-size files inside one volume folder are rare enough that
 * hashing those costs nothing by comparison.
 */
async function duplicatesInVolume(
  volumeId: number,
  volumeTitle: string,
  folder: string
): Promise<DuplicateComicFileGroup[]> {
  const bySize = new Map<number, string[]>();
  for (const path of await listComicFiles(folder)) {
    let size: number;
    try {
      size = (await stat(path)).size;
    } catch {
      continue; // Gone since the walk listed it.
    }
    if (size === 0) continue;

    const group = bySize.get(size);
    if (group) group.push(path);
    else bySize.set(size, [path]);
  }

  const groups: DuplicateComicFileGroup[] = [];
  for (const [size, paths] of bySize) {
    if (paths.length < 2) continue;

    const byHash = new Map<string, string[]>();
    for (const path of paths) {
      let hash: string;
      try {
        hash = await hashFile(path);
      } catch (error) {
        log.warn('Could not read a file to compare it', { path, error });
        continue;
      }
      const group = byHash.get(hash);
      if (group) group.push(path);
      else byHash.set(hash, [path]);
    }

    for (const identical of byHash.values()) {
      if (identical.length < 2) continue;

      const ranked = [...identical].sort((a, b) => copyRank(a) - copyRank(b) || a.localeCompare(b));
      const [keep, ...remove] = ranked as [string, ...string[]];
      groups.push({ volumeId, volumeTitle, keep, remove, bytes: size });
    }
  }

  return groups;
}

/** Every redundant copy in the comic library, newest volumes last. */
export async function findDuplicateComicFiles(): Promise<DuplicateComicFileGroup[]> {
  const groups: DuplicateComicFileGroup[] = [];
  for (const volume of getComicVolumeFolders()) {
    groups.push(...(await duplicatesInVolume(volume.id, volume.title, volume.folder)));
  }
  return groups;
}

/**
 * Hand a copy's issue links to the one being kept, so removing it never makes
 * an issue read as missing — which would send the next sweep off to download
 * the file all over again.
 *
 * The keeper can be a file no scan ever recorded; it gets a row of its own
 * first, or the links would have nowhere to go.
 */
function carryLinks(volumeId: number, keep: string, remove: string, bytes: number): void {
  const db = getDb();
  const idFor = (path: string): number | null =>
    (db.prepare('SELECT id FROM comic_files WHERE filepath = ?').get(path) as
      | { id: number }
      | undefined)?.id ?? null;

  const losingId = idFor(remove);
  if (losingId === null) return;

  const keeperId =
    idFor(keep) ?? upsertComicFile({ volumeId, filepath: keep, size: bytes, fileType: 'issue' });

  db.prepare(
    `INSERT OR IGNORE INTO comic_issue_files (file_id, issue_id, forced)
       SELECT ?, issue_id, forced FROM comic_issue_files WHERE file_id = ?`
  ).run(keeperId, losingId);

  // The row goes with the file; its links go with it by cascade.
  deleteComicFile(losingId);
}

export interface RemoveDuplicatesResult {
  /** How many copies were deleted. */
  removed: number;
  /** Bytes freed. */
  bytes: number;
  errors: Array<{ path: string; error: string }>;
}

/**
 * Delete every redundant copy.
 *
 * Finds them again rather than taking a list from the caller: a preview can be
 * minutes old by the time someone clicks, and this deletes files.
 */
export async function removeDuplicateComicFiles(): Promise<RemoveDuplicatesResult> {
  const result: RemoveDuplicatesResult = { removed: 0, bytes: 0, errors: [] };
  const touched = new Set<number>();

  for (const group of await findDuplicateComicFiles()) {
    for (const path of group.remove) {
      try {
        carryLinks(group.volumeId, group.keep, path, group.bytes);
        await unlink(path);
        result.removed += 1;
        result.bytes += group.bytes;
        touched.add(group.volumeId);
      } catch (error) {
        result.errors.push({
          path,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  for (const volumeId of touched) refreshComicVolumeStats(volumeId);

  log.info('Removed duplicate files', {
    removed: result.removed,
    bytes: result.bytes,
    errors: result.errors.length,
  });

  return result;
}
