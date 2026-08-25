/**
 * Scan a volume's folder and map the files it finds to issues.
 *
 * Derived from Kapowarr (GPL-3.0) `backend/implementations/file_matching.py`
 * (`scan_files`) and `backend/implementations/matching.py`
 * (`file_importing_filter`) — see NOTICE.md.
 */

import { readdir, stat } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';

import {
  getComicFilesForVolume,
  getComicVolumeForMatching,
  getDb,
  linkComicFileToIssues,
  pruneComicFiles,
  refreshComicVolumeStats,
  upsertComicFile,
} from '@shelvarr/db';
import type { FilenameData, SpecialVersion } from '@shelvarr/types';

import { createLogger } from '../utils/logger';
import { extractFilenameData, refineSpecialVersion } from './getcomics/parse';
import { forceRange } from './getcomics/normalise';
import {
  matchSpecialVersion,
  matchVolumeNumber,
  matchYear,
  type VolumeIssueData,
  type VolumeMatchData,
} from './getcomics/match';

const log = createLogger('comics-scan');

/** Files worth looking at inside a volume folder. */
export const SCANNABLE_EXTENSIONS = new Set([
  '.cbz', '.zip', '.cbr', '.rar', '.cb7', '.7z', '.cbt', '.epub', '.pdf',
  '.cba', '.mobi', '.xml', '.json',
]);

/** Directories that never contain library files. */
const IGNORED_DIRECTORIES = new Set(['.git', '@eaDir', '#recycle', '.DS_Store']);

/**
 * Whether a file belongs to this volume at all.
 *
 * Deliberately looser than the search-result filter: a file already sitting in
 * the volume's folder is presumed to be for that volume unless its year *and*
 * volume number both disagree.
 */
export function fileImportingFilter(
  fileData: FilenameData,
  volume: VolumeMatchData,
  issues: VolumeIssueData[],
  numberToYear: Map<number, number | null>
): boolean {
  let issueNumber: number | [number, number];
  if (fileData.issueNumber !== null) {
    issueNumber = fileData.issueNumber;
  } else if (volume.specialVersion === 'volume-as-issue' && fileData.volumeNumber !== null) {
    issueNumber = fileData.volumeNumber;
  } else {
    issueNumber = -Infinity;
  }

  const matchingSpecialVersion = matchSpecialVersion(
    volume.specialVersion,
    fileData.specialVersion,
    volume.title,
    fileData.issueNumber
  );

  const matchingVolumeNumber = matchVolumeNumber(volume, issues, fileData.volumeNumber);
  const matchingYear = matchYear(
    volume.year,
    fileData.year,
    numberToYear.get(forceRange(issueNumber)[1]) ?? null
  );

  return matchingSpecialVersion && (matchingVolumeNumber || matchingYear);
}

/** Every scannable file under `folder`, recursively. */
export async function listComicFiles(folder: string): Promise<string[]> {
  const found: string[] = [];

  async function walk(directory: string): Promise<void> {
    let entries;
    try {
      entries = await readdir(directory, { withFileTypes: true });
    } catch (error) {
      log.warn('Could not read directory', { directory, error });
      return;
    }

    for (const entry of entries) {
      if (entry.name.startsWith('.') || IGNORED_DIRECTORIES.has(entry.name)) continue;
      const path = join(directory, entry.name);

      if (entry.isDirectory()) {
        await walk(path);
        continue;
      }
      const dot = entry.name.lastIndexOf('.');
      if (dot <= 0) continue;
      if (!SCANNABLE_EXTENSIONS.has(entry.name.slice(dot).toLowerCase())) continue;
      found.push(path);
    }
  }

  await walk(folder);
  return found.sort();
}

export interface ScanResult {
  volumeId: number;
  /** Files found in the folder that belong to this volume. */
  matched: number;
  /** Files found but not attributable to any issue. */
  unmatched: string[];
  /** Files previously recorded that are no longer on disk. */
  removed: number;
  /** Issues that now have at least one file. */
  issuesWithFiles: number;
}

/** What kind of file this is, for the `comic_files.file_type` column. */
function classify(fileData: FilenameData): 'issue' | 'cover' | 'metadata' {
  if (fileData.specialVersion === 'cover' && fileData.issueNumber === null) return 'cover';
  if (fileData.specialVersion === 'metadata' && fileData.issueNumber === null) return 'metadata';
  return 'issue';
}

/**
 * Scan a volume's folder, recording every file it owns and linking each to the
 * issues it satisfies.
 *
 * Links a human made by hand are preserved: `linkComicFileToIssues` only
 * clears automatic links, and a manually-linked file that is still on disk
 * keeps its links untouched.
 */
export async function scanVolumeFiles(volumeId: number): Promise<ScanResult> {
  const loaded = getComicVolumeForMatching(volumeId);
  if (!loaded) throw new Error(`Comic volume ${volumeId} not found`);

  const folder = loaded.volume.folder;
  const result: ScanResult = {
    volumeId,
    matched: 0,
    unmatched: [],
    removed: 0,
    issuesWithFiles: 0,
  };

  if (!folder || !existsSync(folder)) {
    log.info('Nothing to scan', { volumeId, folder });
    return result;
  }

  const volume: VolumeMatchData = {
    title: loaded.volume.title,
    altTitle: loaded.volume.altTitle,
    year: loaded.volume.year,
    volumeNumber: loaded.volume.volumeNumber,
    specialVersion: (loaded.volume.specialVersion as SpecialVersion | null) ?? null,
  };
  const issues = [...loaded.issues].sort(
    (a, b) => a.calculatedIssueNumber - b.calculatedIssueNumber
  );
  const numberToYear = new Map(issues.map((issue) => [issue.calculatedIssueNumber, issue.year]));

  // Files a human linked by hand keep their links; we only need to know they
  // are still on disk so the prune below doesn't drop them.
  const manuallyLinked = new Set(
    (
      getDb()
        .prepare(
          `SELECT DISTINCT f.filepath AS filepath
             FROM comic_files f
             JOIN comic_issue_files l ON l.file_id = f.id
            WHERE f.volume_id = ? AND l.forced = 1`
        )
        .all(volumeId) as Array<{ filepath: string }>
    ).map((row) => row.filepath)
  );

  const paths = await listComicFiles(folder);
  const keepPaths: string[] = [];

  for (const path of paths) {
    if (manuallyLinked.has(path)) {
      keepPaths.push(path);
      result.matched += 1;
      continue;
    }

    const raw = extractFilenameData(path, { preferFolderYear: true });
    if (!fileImportingFilter(raw, volume, issues, numberToYear)) {
      result.unmatched.push(path);
      continue;
    }

    const fileData = refineSpecialVersion(
      { specialVersion: volume.specialVersion, volumeNumber: volume.volumeNumber },
      raw
    );

    const fileType = classify(fileData);
    let issueIds: number[] = [];

    if (fileType === 'issue') {
      if (
        volume.specialVersion !== null &&
        volume.specialVersion !== 'volume-as-issue' &&
        fileData.specialVersion !== null
      ) {
        // The volume *is* one book, so its single file covers issue one.
        issueIds = issues.length > 0 ? [issues[0]!.id] : [];
      } else if (fileData.issueNumber !== null) {
        const [start, end] = forceRange(fileData.issueNumber);
        issueIds = issues
          .filter(
            (issue) =>
              start <= issue.calculatedIssueNumber && issue.calculatedIssueNumber <= end
          )
          .map((issue) => issue.id);
      }

      if (issueIds.length === 0) {
        result.unmatched.push(path);
        continue;
      }
    }

    let size = 0;
    try {
      size = (await stat(path)).size;
    } catch {
      // Vanished between listing and stat — skip it.
      continue;
    }

    const fileId = upsertComicFile({ volumeId, filepath: path, size, fileType });
    linkComicFileToIssues(fileId, issueIds);
    keepPaths.push(path);
    result.matched += 1;
  }

  result.removed = pruneComicFiles(volumeId, keepPaths);
  refreshComicVolumeStats(volumeId);

  result.issuesWithFiles = new Set(
    getComicFilesForVolume(volumeId)
      .filter((file) => file.fileType === 'issue')
      .map((file) => file.id)
  ).size;

  log.info('Scan complete', {
    volumeId,
    matched: result.matched,
    unmatched: result.unmatched.length,
    removed: result.removed,
  });

  return result;
}
