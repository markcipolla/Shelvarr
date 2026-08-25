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
  getComicVolume,
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
 * Give colliding names a ` (2)`, ` (3)`… suffix.
 *
 * Two files can legitimately map to the same name — a `.cbz` and a `.pdf` of
 * the same issue, say — so this disambiguates within the proposal rather than
 * dropping one.
 */
function indexSameNames(proposals: RenameProposal[]): RenameProposal[] {
  const seen = new Map<string, number>();

  return proposals.map((proposal) => {
    const count = seen.get(proposal.to) ?? 0;
    seen.set(proposal.to, count + 1);
    if (count === 0) return proposal;

    const extension = extname(proposal.to);
    const stem = proposal.to.slice(0, proposal.to.length - extension.length);
    return { ...proposal, to: `${stem} (${count + 1})${extension}` };
  });
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

    if (to !== file.filepath) proposals.push({ fileId: file.id, from: file.filepath, to });
  }

  preview.files = indexSameNames(proposals).filter(
    (proposal) => proposal.from !== proposal.to
  );
  return preview;
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
