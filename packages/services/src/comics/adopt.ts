/**
 * Take over the volumes Shelvarr has been mirroring from Kapowarr.
 *
 * This is the fast migration path. Shelvarr already has each Kapowarr volume's
 * ComicVine id and its full issue list cached, so adoption needs no ComicVine
 * calls at all: flip the volume to managed, point it at the local folder, and
 * scan. Metadata can be refreshed from ComicVine afterwards at leisure.
 *
 * The slower path — `import-library.ts` — is for folder trees Shelvarr has
 * never seen, where the ComicVine match has to be guessed.
 */

import { existsSync } from 'fs';
import { sep } from 'path';

import {
  execute,
  getComicRootFolders,
  getDb,
  query,
  queryOne,
  refreshComicVolumeStats,
} from '@shelvarr/db';

import { createLogger } from '../utils/logger';
import { remapComicPath } from './archive';
import { scanVolumeFiles } from './scan';

const log = createLogger('comics-adopt');

/** A Kapowarr-mirrored volume that could be taken over. */
export interface AdoptionCandidate {
  volumeId: number;
  title: string;
  comicvineId: number | null;
  /** The path as Kapowarr reports it. */
  remoteFolder: string | null;
  /** That path after `COMIC_PATH_MAP` remapping. */
  localFolder: string | null;
  /** Cached issues; adoption without these leaves the volume issue-less. */
  issueCount: number;
  /** Root folder the local path sits under, if any is configured. */
  rootFolderId: number | null;
  /** Why this volume can't be adopted yet; null when it's ready. */
  blocker: string | null;
}

/** Longest configured root folder that contains `path`. */
function findRootFolder(path: string): { id: number; path: string } | null {
  const candidates = getComicRootFolders()
    .filter((folder) => path === folder.path || path.startsWith(folder.path + sep))
    .sort((a, b) => b.path.length - a.path.length);
  return candidates[0] ?? null;
}

/**
 * Everything Shelvarr is currently mirroring from Kapowarr, with whatever is
 * standing in the way of adopting each one.
 */
export function listAdoptionCandidates(): AdoptionCandidate[] {
  const rows = query<{
    id: number;
    title: string;
    comicvine_id: number | null;
    folder: string | null;
    issue_count: number;
  }>(
    `SELECT c.id, c.title, c.comicvine_id, c.folder,
            (SELECT COUNT(*) FROM comic_issues i
              WHERE i.volume_id = c.id AND i.deleted_at IS NULL) AS issue_count
       FROM comics c
      WHERE c.managed = 0 AND c.deleted_at IS NULL
      ORDER BY c.title COLLATE NOCASE ASC`
  );

  return rows.map((row) => {
    const localFolder = row.folder ? remapComicPath(row.folder) : null;
    const rootFolder = localFolder ? findRootFolder(localFolder) : null;

    let blocker: string | null = null;
    if (!row.folder) {
      blocker = 'No folder was ever recorded for this volume — import it from Comics → Import instead';
    } else if (!localFolder || !existsSync(localFolder)) {
      blocker =
        `Folder not readable at ${localFolder}. ` +
        'Mount it, or set COMIC_PATH_MAP to map the recorded path onto yours.';
    } else if (!rootFolder) {
      blocker = `No configured root folder contains ${localFolder}`;
    } else if (row.issue_count === 0) {
      // Nothing fills a mirror's issue list any more, so this one can only be
      // cleared by going through ComicVine.
      blocker =
        'No issues were ever cached for this volume. Import its folder from ' +
        'Comics → Import, which matches it to ComicVine and takes it over.';
    }

    return {
      volumeId: row.id,
      title: row.title,
      comicvineId: row.comicvine_id,
      remoteFolder: row.folder,
      localFolder,
      issueCount: row.issue_count,
      rootFolderId: rootFolder?.id ?? null,
      blocker,
    };
  });
}

export interface AdoptVolumeResult {
  volumeId: number;
  title: string;
  folder: string;
  issueCount: number;
  matchedFiles: number;
  unmatchedFiles: number;
}

/**
 * Take over one volume.
 *
 * The folder is marked as hand-picked so a later rename leaves the existing
 * layout alone — adoption should never move anyone's files. `last_cv_fetch` is
 * zeroed so the next metadata refresh picks the volume up.
 */
export async function adoptVolume(
  volumeId: number,
  options: { rootFolderId?: number } = {}
): Promise<AdoptVolumeResult> {
  const candidate = listAdoptionCandidates().find((entry) => entry.volumeId === volumeId);
  if (!candidate) {
    const managed = queryOne<{ managed: number }>(
      'SELECT managed FROM comics WHERE id = ?',
      [volumeId]
    );
    if (managed?.managed === 1) throw new Error(`Volume ${volumeId} is already managed`);
    throw new Error(`Volume ${volumeId} not found`);
  }

  const rootFolderId = options.rootFolderId ?? candidate.rootFolderId;
  if (candidate.blocker && !(options.rootFolderId && candidate.blocker.startsWith('No configured'))) {
    throw new Error(candidate.blocker);
  }
  if (rootFolderId === null || rootFolderId === undefined) {
    throw new Error(`No root folder for ${candidate.localFolder}`);
  }

  execute(
    `UPDATE comics SET
       managed = 1,
       root_folder_id = ?,
       folder = ?,
       custom_folder = 1,
       last_cv_fetch = 0,
       updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`,
    [rootFolderId, candidate.localFolder, volumeId]
  );

  // The cached issues carry Kapowarr's own ids in `comicvine_id`; copy the
  // volume's ComicVine id onto them so a later refresh can match them up.
  if (candidate.comicvineId) {
    execute(
      'UPDATE comic_issues SET comicvine_volume_id = ? WHERE volume_id = ? AND comicvine_volume_id IS NULL',
      [candidate.comicvineId, volumeId]
    );
  }

  const scan = await scanVolumeFiles(volumeId);
  refreshComicVolumeStats(volumeId);

  log.info('Adopted volume', {
    volumeId,
    title: candidate.title,
    matched: scan.matched,
    unmatched: scan.unmatched.length,
  });

  return {
    volumeId,
    title: candidate.title,
    folder: candidate.localFolder!,
    issueCount: candidate.issueCount,
    matchedFiles: scan.matched,
    unmatchedFiles: scan.unmatched.length,
  };
}

export interface AdoptAllResult {
  adopted: AdoptVolumeResult[];
  skipped: Array<{ volumeId: number; title: string; reason: string }>;
}

/**
 * Take over every volume that's ready, reporting the ones that aren't and why.
 *
 * Deliberately does not stop at the first problem: a library where three
 * volumes have a stale folder should still migrate the other two hundred.
 */
export async function adoptAllVolumes(
  options: {
    signal?: AbortSignal;
    onProgress?: (done: number, total: number) => void;
  } = {}
): Promise<AdoptAllResult> {
  const candidates = listAdoptionCandidates();
  const result: AdoptAllResult = { adopted: [], skipped: [] };

  for (const [index, candidate] of candidates.entries()) {
    if (options.signal?.aborted) break;

    if (candidate.blocker) {
      result.skipped.push({
        volumeId: candidate.volumeId,
        title: candidate.title,
        reason: candidate.blocker,
      });
    } else {
      try {
        result.adopted.push(await adoptVolume(candidate.volumeId));
      } catch (error) {
        result.skipped.push({
          volumeId: candidate.volumeId,
          title: candidate.title,
          reason: error instanceof Error ? error.message : String(error),
        });
      }
    }

    options.onProgress?.(index + 1, candidates.length);
  }

  log.info('Adoption finished', {
    adopted: result.adopted.length,
    skipped: result.skipped.length,
  });

  return result;
}

/**
 * Undo an adoption, putting the volume back to being a Kapowarr mirror.
 *
 * Only useful if the migration was a mistake; the files themselves are never
 * touched either way.
 */
export function unadoptVolume(volumeId: number): void {
  const database = getDb();
  database.transaction(() => {
    execute('DELETE FROM comic_files WHERE volume_id = ?', [volumeId]);
    execute(
      `UPDATE comics SET managed = 0, root_folder_id = NULL, custom_folder = 0
        WHERE id = ?`,
      [volumeId]
    );
  })();
}
