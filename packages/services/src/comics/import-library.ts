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
import type { ComicFolderOwner } from '@shelvarr/db';
import type { ComicVolumeMetadata, FilenameData } from '@shelvarr/types';

import { createLogger } from '../utils/logger';
import { addVolume, comicFolderOwners, getComicVine, sameFolderKey } from './library';
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
 * A ComicVine volume a folder might be, trimmed to what the review shows.
 *
 * Deliberately not `ComicVolumeMetadata`: a candidate can come from a row we
 * already have rather than from a request, and the review only ever prints
 * these six fields.
 */
export interface ImportCandidate {
  comicvineId: number;
  title: string;
  year: number | null;
  volumeNumber: number;
  publisher: string | null;
  issueCount: number;
}

/** A group with the ComicVine volumes it might be. */
export interface ImportProposal extends ImportGroup {
  /** Candidate matches, best first. Empty when ComicVine had nothing. */
  candidates: ImportCandidate[];
  /** The candidate we'd pick automatically, if we're confident enough. */
  suggested: ImportCandidate | null;
  /** Local volume id when this folder is already in the library. */
  alreadyAdded: number | null;
  /**
   * False when this folder was never put to ComicVine — the hourly quota ran
   * out first. "Not asked yet" and "asked, nothing there" look identical
   * otherwise, and the difference is whether scanning again would help.
   */
  checked: boolean;
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
  // ponytail: a flat ceiling, high enough for a real library — raise it or
  // report the truncation if anyone's collection outgrows it.
  const maxGroups = options.maxGroups ?? 2000;

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

/** The match a volume already carries, offered as the candidate for its folder. */
function candidateFromOwner(owner: ComicFolderOwner): ImportCandidate {
  return {
    comicvineId: owner.comicvineId,
    title: owner.title,
    year: owner.year,
    volumeNumber: owner.volumeNumber,
    publisher: owner.publisher,
    issueCount: owner.issueCount,
  };
}

/** Trim ComicVine metadata to what the review shows. */
function candidateFromMetadata(metadata: ComicVolumeMetadata): ImportCandidate {
  return {
    comicvineId: metadata.comicvineId,
    title: metadata.title,
    year: metadata.year,
    volumeNumber: metadata.volumeNumber,
    publisher: metadata.publisher,
    issueCount: metadata.issueCount,
  };
}

/**
 * Whether an error is ComicVine's hourly quota rather than a real failure.
 *
 * Matched by name rather than by type: the same error class loaded twice —
 * which dynamic imports in tests do — would fail an `instanceof`.
 */
function isQuotaSpent(error: unknown): boolean {
  return error instanceof Error && error.name === 'ComicVineRateLimitError';
}

/** What a previous scan already worked out about a folder. */
export interface ReusableProposal {
  candidates: ImportCandidate[];
  suggestedComicvineId: number | null;
}

export interface ProposeLibraryImportResult {
  proposals: ImportProposal[];
  /** True when ComicVine's hourly quota ran out before every folder was asked. */
  quotaSpent: boolean;
}

/**
 * Work out what each folder is, asking ComicVine only where we have to.
 *
 * ComicVine allows about 200 requests per resource per hour, so a request is
 * the scarce thing here, not time. Three of the four answers cost nothing:
 * a folder Shelvarr already owns needs no match at all, a folder mirrored from
 * a previous manager already carries the id that manager matched it to (and
 * its title and year came from ComicVine in the first place), and a folder a
 * previous scan already answered is passed in through `reuse`. Only a folder
 * nobody has ever matched costs a search.
 *
 * When the quota does run out, the remaining folders come back `checked:
 * false` rather than as empty matches, and scanning again picks up where this
 * one stopped.
 */
export async function proposeLibraryImport(
  groups: ImportGroup[],
  options: {
    signal?: AbortSignal;
    onProgress?: (done: number, total: number) => void;
    /** Folder -> what the previous scan of this path found for it. */
    reuse?: Map<string, ReusableProposal>;
  } = {}
): Promise<ProposeLibraryImportResult> {
  const proposals: ImportProposal[] = [];
  const owners = comicFolderOwners();
  const reuse = options.reuse ?? new Map<string, ReusableProposal>();

  /** Built on first use: a scan can get all the way through without one. */
  let client: Awaited<ReturnType<typeof getComicVine>> | null = null;
  let quotaSpent = false;

  for (const [index, group] of groups.entries()) {
    if (options.signal?.aborted) break;

    const key = sameFolderKey(group.folder);
    const owner = owners.get(key) ?? null;
    const reused = reuse.get(key);

    const add = (
      candidates: ImportCandidate[],
      suggested: ImportCandidate | null,
      alreadyAdded: number | null,
      checked = true
    ) => {
      proposals.push({ ...group, candidates, suggested, alreadyAdded, checked });
      options.onProgress?.(index + 1, groups.length);
    };

    // Shelvarr already owns this folder: there is nothing to match and nothing
    // to offer, and importing it again would only cost requests.
    if (owner?.managed) {
      add([], null, owner.id);
      continue;
    }

    // Mirrored from a previous manager. Its ComicVine id is a fact rather than
    // a guess, and the row holds everything the review prints, so taking it
    // over costs no lookup at all — that is the whole of the migration path.
    if (owner) {
      const candidate = candidateFromOwner(owner);
      add([candidate], candidate, owner.id);
      continue;
    }

    // Answered by an earlier scan of this path. Keeping it is what makes a
    // scan resumable after the quota runs out.
    if (reused) {
      const candidates = reused.candidates;
      const suggested =
        candidates.find((c) => c.comicvineId === reused.suggestedComicvineId) ?? null;
      add(
        candidates,
        suggested,
        suggested ? getComicVolumeByComicvineId(suggested.comicvineId)?.id ?? null : null
      );
      continue;
    }

    // Out of requests for this hour. Left unchecked on purpose: reporting it
    // as "no match" would send someone off to add by hand a volume ComicVine
    // has, and would be remembered as an answer by the next scan.
    if (quotaSpent) {
      add([], null, null, false);
      continue;
    }

    if (!group.info.series) {
      add([], null, null);
      continue;
    }

    // The year is deliberately left out of the query: ComicVine matches on
    // every word, so searching "Gear School 2007" for a volume whose name is
    // just "Gear School" comes back empty. It ranks the results instead.
    let found: ComicVolumeMetadata[] = [];
    try {
      client ??= await getComicVine(options.signal);
      found = await client.searchVolumes(group.info.series);
    } catch (error) {
      if (isQuotaSpent(error)) {
        log.warn('ComicVine hourly quota spent; leaving the rest of the scan unchecked', {
          folder: group.folder,
          remaining: groups.length - index,
        });
        quotaSpent = true;
        add([], null, null, false);
        continue;
      }
      log.warn('ComicVine search failed for group', { folder: group.folder, error });
    }

    found.sort((a, b) => candidateRank(a, group.info) - candidateRank(b, group.info));

    // Only suggest automatically when the title actually matches — a wrong
    // auto-match is worse than no suggestion, because it silently adopts
    // someone's library into the wrong series.
    const best = found[0];
    const suggested =
      best && matchTitle(best.title, group.info.series) ? candidateFromMetadata(best) : null;

    add(
      found.slice(0, 10).map(candidateFromMetadata),
      suggested,
      suggested ? getComicVolumeByComicvineId(suggested.comicvineId)?.id ?? null : null
    );
  }

  return { proposals, quotaSpent };
}

export interface ImportSelection {
  folder: string;
  comicvineId: number;
}

export interface ImportResult {
  imported: Array<{ folder: string; volumeId: number; matchedFiles: number }>;
  failed: Array<{ folder: string; error: string }>;
  /**
   * Selections not attempted, because ComicVine's hourly quota ran out. The
   * caller is expected to come back for these rather than count them failed.
   */
  remaining: ImportSelection[];
}

/**
 * Adopt the chosen folders into the library.
 *
 * Each volume keeps the folder it's already in (`customFolder`), so importing
 * never moves anyone's files. Run a rename afterwards if you want them
 * reorganised.
 *
 * Adopting a volume costs at least two ComicVine requests, so a big import
 * runs out of quota partway through. That stops the loop rather than burning
 * through the rest collecting the same error 200 times: what has not been
 * tried comes back as `remaining` for the caller to resume with.
 */
export async function applyLibraryImport(
  selections: ImportSelection[],
  rootFolderId: number,
  options: { signal?: AbortSignal; onProgress?: (done: number, total: number) => void } = {}
): Promise<ImportResult> {
  const result: ImportResult = { imported: [], failed: [], remaining: [] };

  for (const [index, selection] of selections.entries()) {
    if (options.signal?.aborted) {
      result.remaining = selections.slice(index);
      break;
    }

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
      if (isQuotaSpent(error)) {
        result.remaining = selections.slice(index);
        log.warn('ComicVine hourly quota spent mid-import', {
          imported: result.imported.length,
          remaining: result.remaining.length,
        });
        break;
      }
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
    remaining: result.remaining.length,
  });

  return result;
}
