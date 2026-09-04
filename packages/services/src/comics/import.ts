/**
 * Move a finished download into the comic library under its proper name.
 *
 * Stands in for Kapowarr's post-processing (GPL-3.0,
 * `backend/features/post_processing.py`) — see NOTICE.md — minus the format
 * conversion, which Shelvarr's reader does on the fly instead.
 */

import { constants, existsSync, renameSync, statSync } from 'fs';
import { access, copyFile, mkdir, unlink } from 'fs/promises';
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
export function resolveImportDirectory(
  volume: NamingVolume & { folder: string | null }
): string {
  const { getcomics } = getServiceConfig();

  if (volume.folder) return remapComicPath(volume.folder);
  if (getcomics.libraryRoot) {
    return join(getcomics.libraryRoot, generateVolumeFolderName(volume));
  }
  throw new Error(
    'No destination for the download: the volume has no folder and COMIC_LIBRARY_ROOT is unset'
  );
}

export function resolveImportTarget(
  volume: NamingVolume & { folder: string | null },
  filename: string
): ImportTarget {
  const directory = resolveImportDirectory(volume);
  return { directory, path: join(directory, filename) };
}

/**
 * Rewrite a permissions failure into something a user can act on.
 *
 * The bare `EACCES: permission denied, copyfile ...` that Node throws says
 * nothing about *who* was denied, and the answer is nearly always that the
 * library bind mount belongs to a different uid than the one the container
 * runs as. Name both, and the fix.
 */
function describeWriteFailure(directory: string, error: unknown): Error {
  const code = (error as NodeJS.ErrnoException).code;
  if (code !== 'EACCES' && code !== 'EPERM' && code !== 'EROFS') {
    return error instanceof Error ? error : new Error(String(error));
  }

  const uid = process.getuid?.();
  const gid = process.getgid?.();
  const who = uid === undefined ? 'this process' : `uid ${uid}:${gid}`;
  const remedy =
    code === 'EROFS'
      ? 'the mount is read-only — mount it `:rw`'
      : `grant ${who} write access to that folder, or set PUID/PGID to the ` +
        'user that owns your library';

  return new Error(`Cannot write to ${directory} as ${who}: ${remedy}.`);
}

/**
 * Check the library folder can be written to, creating it if need be.
 *
 * Called before a download starts as well as during the import: without the
 * up-front check a wrongly-owned bind mount downloads the whole file and only
 * then fails on the move into place.
 */
export async function ensureImportable(
  volume: NamingVolume & { folder: string | null }
): Promise<string> {
  const directory = resolveImportDirectory(volume);
  try {
    await mkdir(directory, { recursive: true });
    await access(directory, constants.W_OK | constants.X_OK);
  } catch (error) {
    throw describeWriteFailure(directory, error);
  }
  return directory;
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

  const directory = await ensureImportable(volume);
  const destination = uniquePath(join(directory, filename));
  try {
    await moveFile(sourcePath, destination);
  } catch (error) {
    throw describeWriteFailure(directory, error);
  }

  const bytes = statSync(destination).size;
  log.info('Imported download', { destination, bytes });

  return { path: destination, bytes, renamed: rename };
}
