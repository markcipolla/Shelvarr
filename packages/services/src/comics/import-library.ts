/**
 * Adopt an existing comic library: walk a folder tree, work out what each
 * folder is, and propose a ComicVine match for it.
 *
 * This is the migration path off Kapowarr — point it at the folder Kapowarr
 * was managing and the volumes come across with their files already matched.
 *
 * Derived from Kapowarr (GPL-3.0) `backend/features/library_import.py` —
 * see NOTICE.md.
 */

import { readdir } from 'fs/promises';
import { existsSync } from 'fs';
import { basename, join } from 'path';

import { getComicVolumeByComicvineId } from '@shelvarr/db';
import type { ComicVolumeMetadata, FilenameData } from '@shelvarr/types';

import { createLogger } from '../utils/logger';
import { ComicVineRateLimitError } from './comicvine';
import { getComicVine } from './library';
import { addVolume } from './library';
import { extractFilenameData } from './getcomics/parse';
import { matchTitle, matchYear } from './getcomics/match';
import { SCANNABLE_EXTENSIONS } from './scan';

const log = createLogger('comics-import-library');

/** A folder of files that look like they belong to one volume. */
export interface ImportGroup {
  /** Absolute path to the folder holding the files. */
  folder: string;
  /** What the folder and its filenames say the series is. */
  info: FilenameData;
  /** Files found in the folder. */
  files: string[];
}

/**
 * Why a folder has no candidates, when the reason is something other than
 * ComicVine genuinely knowing nothing about it.
 *
 * `null` is the only value that means "ComicVine was asked and had no match" —
 * everything else means we never got an answer, which is a different thing to
 * tell the user.
 */
export type ImportSearchFailure =
  /** ComicVine locked us out mid-scan; this folder's search is the one that hit it. */
  | 'rate-limited'
  /** The lockout was already in force, so this folder was never searched. */
  | 'not-searched'
  /** The search threw for some other reason (network, bad key, CV error). */
  | 'error';

/** A group with the ComicVine volumes it might be. */
export interface ImportProposal extends ImportGroup {
  /** Candidate matches, best first. Empty when ComicVine had nothing. */
  candidates: ComicVolumeMetadata[];
  /** The candidate we'd pick automatically, if we're confident enough. */
  suggested: ComicVolumeMetadata | null;
  /** Local volume id when this folder is already in the library. */
  alreadyAdded: number | null;
  /** Set when `candidates` is empty because the search never answered. */
  failure: ImportSearchFailure | null;
  /** The message behind `failure: 'error'`. */
  failureMessage: string | null;
}

/**
 * Group the files under `rootPath` by the folder that holds them.
 *
 * A volume is a folder of files in every layout we care about (including
 * Kapowarr's own), so the folder is the unit — but the series name is taken
 * from the filenames when they agree, since folder names are often terser.
 */
export async function findImportGroups(
  rootPath: string,
  options: { maxGroups?: number } = {}
): Promise<ImportGroup[]> {
  if (!existsSync(rootPath)) throw new Error(`No such folder: ${rootPath}`);

  const groups: ImportGroup[] = [];
  const maxGroups = options.maxGroups ?? 500;

  async function walk(directory: string): Promise<void> {
    if (groups.length >= maxGroups) return;

    let entries;
    try {
      entries = await readdir(directory, { withFileTypes: true });
    } catch (error) {
      log.warn('Could not read directory', { directory, error });
      return;
    }

    const direct: string[] = [];
    const subdirectories: string[] = [];
    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue;
      if (entry.isDirectory()) {
        subdirectories.push(join(directory, entry.name));
        continue;
      }
      const dot = entry.name.lastIndexOf('.');
      if (dot > 0 && SCANNABLE_EXTENSIONS.has(entry.name.slice(dot).toLowerCase())) {
        direct.push(join(directory, entry.name));
      }
    }

    // Files sitting directly in this folder make it a candidate volume.
    if (direct.length > 0) {
      direct.sort();
      groups.push({
        folder: directory,
        info: describeGroup(directory, direct),
        files: direct,
      });
    }

    for (const subdirectory of subdirectories) await walk(subdirectory);
  }

  await walk(rootPath);
  return groups;
}

/**
 * Decide what a folder of files is about.
 *
 * Every file in the folder is parsed and the most common series name wins.
 * That beats parsing the folder name alone: a stray "Annual" or a misnamed
 * file can't drag the whole group off course, and `preferFolderYear` still
 * lets the folder supply the year.
 */
function describeGroup(folder: string, files: string[]): FilenameData {
  const parsed = files.map((file) =>
    extractFilenameData(file, {
      assumeVolumeNumber: false,
      preferFolderYear: true,
      fixYear: true,
    })
  );

  const seriesCounts = new Map<string, number>();
  for (const data of parsed) {
    if (!data.series) continue;
    seriesCounts.set(data.series, (seriesCounts.get(data.series) ?? 0) + 1);
  }

  const modalSeries = [...seriesCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  const representative =
    parsed.find((data) => data.series === modalSeries) ?? parsed[0]!;

  return {
    ...representative,
    // The folder name is the better source for the series when the files
    // themselves disagree with each other.
    series: modalSeries ?? basename(folder),
  };
}

/** Score a ComicVine candidate against what the folder says. Lower is better. */
function candidateRank(candidate: ComicVolumeMetadata, info: FilenameData): number {
  let score = 0;
  if (!matchTitle(candidate.title, info.series)) score += 4;
  if (!matchYear(candidate.year, info.year, null, true)) score += 2;
  if (info.volumeNumber !== null && !Array.isArray(info.volumeNumber)) {
    if (candidate.volumeNumber !== info.volumeNumber) score += 1;
  }
  if (candidate.translated) score += 1;
  return score;
}

/**
 * Search ComicVine for each group and rank the candidates.
 *
 * One search per group, spaced by the client's own rate limiting — a library
 * of 200 volumes therefore takes a few minutes. That's why this runs as a
 * background task rather than inline in a request.
 *
 * ComicVine's hourly cap is low enough that a big library will hit it. When it
 * does, the scan stops searching: every later request would fail the same way,
 * and hammering a service that has just locked us out only lengthens the
 * lockout. The remaining folders come back marked `not-searched` so the review
 * can say so instead of pretending ComicVine had no match for them.
 */
export async function proposeLibraryImport(
  groups: ImportGroup[],
  options: {
    signal?: AbortSignal;
    onProgress?: (done: number, total: number) => void;
  } = {}
): Promise<ImportProposal[]> {
  const client = await getComicVine(options.signal);
  const proposals: ImportProposal[] = [];
  let rateLimited = false;

  for (const [index, group] of groups.entries()) {
    if (options.signal?.aborted) break;

    let candidates: ComicVolumeMetadata[] = [];
    let failure: ImportSearchFailure | null = rateLimited ? 'not-searched' : null;
    let failureMessage: string | null = null;

    if (!rateLimited && group.info.series) {
      const query = group.info.year
        ? `${group.info.series} ${group.info.year}`
        : group.info.series;
      try {
        candidates = await client.searchVolumes(query);
      } catch (error) {
        if (error instanceof ComicVineRateLimitError) {
          rateLimited = true;
          failure = 'rate-limited';
          log.warn('ComicVine rate limit reached; leaving the rest of the scan unsearched', {
            folder: group.folder,
            searched: index,
            total: groups.length,
          });
        } else {
          failure = 'error';
          failureMessage = error instanceof Error ? error.message : String(error);
          log.warn('ComicVine search failed for group', { folder: group.folder, error });
        }
      }
    }

    candidates.sort((a, b) => candidateRank(a, group.info) - candidateRank(b, group.info));

    // Only suggest automatically when the title actually matches — a wrong
    // auto-match is worse than no suggestion, because it silently adopts
    // someone's library into the wrong series.
    const best = candidates[0];
    const suggested =
      best && matchTitle(best.title, group.info.series) ? best : null;

    proposals.push({
      ...group,
      candidates: candidates.slice(0, 10),
      suggested,
      alreadyAdded: suggested
        ? getComicVolumeByComicvineId(suggested.comicvineId)?.id ?? null
        : null,
      failure,
      failureMessage,
    });

    options.onProgress?.(index + 1, groups.length);
  }

  return proposals;
}

export interface ImportSelection {
  folder: string;
  comicvineId: number;
}

export interface ImportResult {
  imported: Array<{ folder: string; volumeId: number; matchedFiles: number }>;
  failed: Array<{ folder: string; error: string }>;
}

/**
 * Adopt the chosen folders into the library.
 *
 * Each volume keeps the folder it's already in (`customFolder`), so importing
 * never moves anyone's files. Run a rename afterwards if you want them
 * reorganised.
 */
export async function applyLibraryImport(
  selections: ImportSelection[],
  rootFolderId: number,
  options: { signal?: AbortSignal; onProgress?: (done: number, total: number) => void } = {}
): Promise<ImportResult> {
  const result: ImportResult = { imported: [], failed: [] };

  for (const [index, selection] of selections.entries()) {
    if (options.signal?.aborted) break;

    try {
      const added = await addVolume({
        comicvineId: selection.comicvineId,
        rootFolderId,
        folder: selection.folder,
        ...(options.signal ? { signal: options.signal } : {}),
      });
      result.imported.push({
        folder: selection.folder,
        volumeId: added.volumeId,
        matchedFiles: added.matchedFiles,
      });
    } catch (error) {
      result.failed.push({
        folder: selection.folder,
        error: error instanceof Error ? error.message : String(error),
      });
    }

    options.onProgress?.(index + 1, selections.length);
  }

  log.info('Library import finished', {
    imported: result.imported.length,
    failed: result.failed.length,
  });

  return result;
}
