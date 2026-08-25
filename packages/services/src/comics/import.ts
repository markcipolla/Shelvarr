/**
 * Move a finished download into the comic library under its proper name.
 *
 * Stands in for Kapowarr's post-processing (GPL-3.0,
 * `backend/features/post_processing.py`) — see NOTICE.md — minus the format
 * conversion, which Shelvarr's reader does on the fly instead.
 */

import { existsSync, renameSync, statSync } from 'fs';
import { copyFile, mkdir, unlink } from 'fs/promises';
import { extname, join } from 'path';

import type { ComicDownload } from '@shelvarr/types';

import { getServiceConfig } from '../config';
import { createLogger } from '../utils/logger';
import { remapComicPath } from './archive';
import { generateVolumeFolderName, type NamingVolume } from './naming';

const log = createLogger('comics-import');

export interface ImportTarget {
  /** Directory the file should end up in. */
  directory: string;
  /** Full destination path. */
  path: string;
}

/**
 * Work out where a download belongs.
 *
 * Prefers the volume's existing folder, so files land next to the rest of the
 * series — including while Kapowarr still owns the library, where the recorded
 * folder is a Kapowarr-side path and needs the usual remap. Falls back to
 * building a folder from the naming template under the configured library root.
 */
export function resolveImportTarget(
  volume: NamingVolume & { folder: string | null },
  filename: string
): ImportTarget {
  const { getcomics } = getServiceConfig();

  let directory: string;
  if (volume.folder) {
    directory = remapComicPath(volume.folder);
  } else if (getcomics.libraryRoot) {
    directory = join(getcomics.libraryRoot, generateVolumeFolderName(volume));
  } else {
    throw new Error(
      'No destination for the download: the volume has no folder and COMIC_LIBRARY_ROOT is unset'
    );
  }

  return { directory, path: join(directory, filename) };
}

/**
 * Add ` (2)`, ` (3)`… before the extension until the path is free, so an
 * import never silently clobbers an existing file.
 */
export function uniquePath(path: string): string {
  if (!existsSync(path)) return path;

  const extension = extname(path);
  const stem = path.slice(0, path.length - extension.length);
  for (let counter = 2; counter < 1000; counter++) {
    const candidate = `${stem} (${counter})${extension}`;
    if (!existsSync(candidate)) return candidate;
  }
  throw new Error(`Could not find a free filename for ${path}`);
}

/**
 * Move `sourcePath` into place, falling back to copy+delete when the scratch
 * directory and the library are on different filesystems — the normal case in
 * Docker, where downloads sit on the data volume and the library is a bind
 * mount.
 */
async function moveFile(sourcePath: string, destinationPath: string): Promise<void> {
  try {
    renameSync(sourcePath, destinationPath);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code !== 'EXDEV') throw error;
    await copyFile(sourcePath, destinationPath);
    await unlink(sourcePath);
  }
}

export interface ImportResult {
  path: string;
  bytes: number;
  renamed: boolean;
}

/**
 * Import a downloaded file: rename it to the configured template (when
 * enabled) and move it into the volume's folder.
 */
export async function importComicDownload(
  download: Pick<ComicDownload, 'filenameBody'>,
  sourcePath: string,
  volume: NamingVolume & { folder: string | null }
): Promise<ImportResult> {
  if (!existsSync(sourcePath)) {
    throw new Error(`Downloaded file is missing: ${sourcePath}`);
  }

  const extension = extname(sourcePath) || '.cbz';
  const rename = Boolean(download.filenameBody);
  const filename = rename
    ? `${download.filenameBody}${extension}`
    : sourcePath.split(/[\\/]/).pop()!;

  const target = resolveImportTarget(volume, filename);
  await mkdir(target.directory, { recursive: true });

  const destination = uniquePath(target.path);
  await moveFile(sourcePath, destination);

  const bytes = statSync(destination).size;
  log.info('Imported download', { destination, bytes });

  return { path: destination, bytes, renamed: rename };
}
