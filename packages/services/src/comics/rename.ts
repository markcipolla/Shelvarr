/**
 * Rename a volume's files (and folder) to match the naming templates.
 *
 * Derived from Kapowarr (GPL-3.0) `backend/implementations/naming.py`
 * (`preview_mass_rename`, `mass_rename`, `same_name_indexing`) —
 * see NOTICE.md.
 */

import { existsSync } from 'fs';
import { mkdir, rename, rmdir } from 'fs/promises';
import { dirname, extname, join, relative } from 'path';

import {
  getComicFilesForVolume,
  getComicRootFolder,
  getComicRootFolderForLibrary,
  getComicVolume,
  getComicVolumeIdsInRootFolder,
  getDb,
  setComicVolumeFolder,
  updateComicFilePath,
} from '@shelvarr/db';
import type { IssueNumber } from '@shelvarr/types';

import { createLogger } from '../utils/logger';
import { generateIssueName, generateVolumeFolderName, type NamingVolume } from './naming';

const log = createLogger('comics-rename');

export interface RenameProposal {
  fileId: number;
  from: string;
  to: string;
}

export interface RenamePreview {
  volumeId: number;
  /** Set when the volume's folder itself would move. */
  folderFrom: string | null;
  folderTo: string | null;
  files: RenameProposal[];
}

/** The issues a file is linked to, keyed by file id. */
function issueNumbersByFile(volumeId: number): Map<number, IssueNumber> {
  const rows = getDb()
    .prepare(
      `SELECT l.file_id AS file_id, MIN(i.calculated_issue_number) AS low,
              MAX(i.calculated_issue_number) AS high
         FROM comic_issue_files l
         JOIN comic_issues i ON i.id = l.issue_id
        WHERE i.volume_id = ?
        GROUP BY l.file_id`
    )
    .all(volumeId) as Array<{ file_id: number; low: number | null; high: number | null }>;

  const result = new Map<number, IssueNumber>();
  for (const row of rows) {
    if (row.low === null || row.high === null) continue;
    result.set(row.file_id, row.low === row.high ? row.low : [row.low, row.high]);
  }
  return result;
}

/**
 * Give files that want the same name a ` (2)`, ` (3)`… suffix.
 *
 * Two files can legitimately map to the same name — a `.cbz` and a `.pdf` of
 * the same issue, say — so this disambiguates rather than dropping one.
 *
 * Takes *every* file, including the ones already correctly named, and lets a
 * file that already sits on one of the names its group will use keep it. Both
 * matter: numbering only the files that happen to need moving renumbers them
 * differently on every run, so the organiser proposes the same 700 moves for
 * ever and each one renames a file over a sibling that had not moved yet.
 */
function indexSameNames(proposals: RenameProposal[]): RenameProposal[] {
  const groups = new Map<string, RenameProposal[]>();
  for (const proposal of proposals) {
    const group = groups.get(proposal.to);
    if (group) group.push(proposal);
    else groups.set(proposal.to, [proposal]);
  }

  const settled = new Map<RenameProposal, string>();
  for (const [base, group] of groups) {
    const extension = extname(base);
    const stem = base.slice(0, base.length - extension.length);
    const names = group.map((_, index) =>
      index === 0 ? base : `${stem} (${index + 1})${extension}`
    );
    const available = new Set(names);

    for (const proposal of group) {
      if (!available.delete(proposal.from)) continue;
      settled.set(proposal, proposal.from);
    }
    const spare = names.filter((name) => available.has(name));
    let next = 0;
    for (const proposal of group) {
      if (!settled.has(proposal)) settled.set(proposal, spare[next++]!);
    }
  }

  return proposals.map((proposal) => ({ ...proposal, to: settled.get(proposal)! }));
}

function namingVolume(volume: NonNullable<ReturnType<typeof getComicVolume>>): NamingVolume {
  return {
    title: volume.title,
    year: volume.year,
    volumeNumber: volume.volumeNumber,
    publisher: volume.publisher,
    specialVersion: volume.specialVersion,
  };
}

/**
 * Work out what a rename would do, without touching anything.
 *
 * Files that are already correctly named are left out, so an empty `files`
 * list means "nothing to do".
 */
export function previewVolumeRename(volumeId: number): RenamePreview {
  const volume = getComicVolume(volumeId);
  if (!volume) throw new Error(`Comic volume ${volumeId} not found`);

  const preview: RenamePreview = {
    volumeId,
    folderFrom: null,
    folderTo: null,
    files: [],
  };

  // Work out the target folder first: file paths hang off it.
  let targetFolder = volume.folder;
  if (!volume.customFolder && volume.rootFolderId !== null) {
    const rootFolder = getComicRootFolder(volume.rootFolderId);
    if (rootFolder) {
      const desired = join(rootFolder.path, generateVolumeFolderName(namingVolume(volume)));
      if (desired !== volume.folder) {
        preview.folderFrom = volume.folder;
        preview.folderTo = desired;
      }
      targetFolder = desired;
    }
  }
  if (!targetFolder) return preview;

  const numbers = issueNumbersByFile(volumeId);
  const proposals: RenameProposal[] = [];

  for (const file of getComicFilesForVolume(volumeId)) {
    const extension = extname(file.filepath);

    let to: string;
    if (file.fileType === 'issue') {
      const issueNumber = numbers.get(file.id);
      // A file we can't attribute to an issue keeps its name; renaming it
      // would be a guess.
      if (issueNumber === undefined) continue;
      to = join(targetFolder, `${generateIssueName(namingVolume(volume), issueNumber)}${extension}`);
    } else {
      // Covers and metadata keep their filename but follow the folder.
      const relativePath = volume.folder
        ? relative(volume.folder, file.filepath)
        : file.filepath.split(/[\\/]/).pop()!;
      to = join(targetFolder, relativePath);
    }

    // Everything goes in, including files already correctly named: they hold
    // the un-suffixed name, and indexSameNames has to see that.
    proposals.push({ fileId: file.id, from: file.filepath, to });
  }

  preview.files = indexSameNames(proposals).filter(
    (proposal) => proposal.from !== proposal.to
  );
  return preview;
}

/**
 * Preview a rename across a whole comic library — the comic answer to the
 * book organizer's library-wide preview.
 *
 * Volumes with nothing to do are left out, so an empty array means the
 * library already matches the naming templates. A library with no root folder
 * owns no volumes, so there is nothing to propose either.
 */
export function previewLibraryRename(libraryId: number): RenamePreview[] {
  const rootFolder = getComicRootFolderForLibrary(libraryId);
  if (!rootFolder) return [];

  return getComicVolumeIdsInRootFolder(rootFolder.id)
    .map((volumeId) => previewVolumeRename(volumeId))
    .filter((preview) => preview.files.length > 0 || preview.folderTo !== null);
}

export interface RenameResult {
  volumeId: number;
  renamed: number;
  folderMoved: boolean;
  errors: Array<{ from: string; error: string }>;
}

/**
 * Apply a rename. Each file is moved individually and recorded as it goes, so
 * a failure part-way through leaves the database consistent with the disk
 * rather than pointing at paths that no longer exist.
 */
export async function applyVolumeRename(volumeId: number): Promise<RenameResult> {
  const preview = previewVolumeRename(volumeId);
  const result: RenameResult = {
    volumeId,
    renamed: 0,
    folderMoved: false,
    errors: [],
  };

  for (const proposal of preview.files) {
    // `rename` overwrites its destination without a word, so anything already
    // sitting there — a file no scan ever recorded, say — would be destroyed.
    // A case-only rename is the same file on a case-insensitive filesystem, so
    // that one is allowed through.
    if (
      proposal.from.toLowerCase() !== proposal.to.toLowerCase() &&
      existsSync(proposal.to)
    ) {
      result.errors.push({ from: proposal.from, error: `${proposal.to} already exists` });
      continue;
    }

    try {
      await mkdir(dirname(proposal.to), { recursive: true });
      await rename(proposal.from, proposal.to);
      updateComicFilePath(proposal.fileId, proposal.to);
      result.renamed += 1;
    } catch (error) {
      result.errors.push({
        from: proposal.from,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  if (preview.folderTo) {
    setComicVolumeFolder(volumeId, preview.folderTo, false);
    result.folderMoved = true;

    // The files have already moved out; drop the old folder if it's empty.
    if (preview.folderFrom && existsSync(preview.folderFrom)) {
      await rmdir(preview.folderFrom).catch(() => {
        // Still has something in it — leave it alone rather than deleting
        // files we don't know about.
      });
    }
  }

  log.info('Rename complete', {
    volumeId,
    renamed: result.renamed,
    errors: result.errors.length,
  });

  return result;
}
