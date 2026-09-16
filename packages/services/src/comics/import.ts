/**
 * Move a finished download into the comic library under its proper name.
 *
 * Stands in for Kapowarr's post-processing (GPL-3.0,
 * `backend/features/post_processing.py`) — see NOTICE.md — minus the format
 * conversion, which Shelvarr's reader does on the fly instead.
 */

import { constants, existsSync, renameSync, statSync } from 'fs';
import { access, copyFile, mkdir, unlink } from 'fs/promises';
import { dirname, extname, join, parse, sep } from 'path';

import { getComicRootFolder, getComicRootFolders } from '@shelvarr/db';
import type { ComicDownload } from '@shelvarr/types';

import { getServiceConfig } from '../config';
import { describeWriteFailure } from '../utils/fs-errors';
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

export type ImportVolume = NamingVolume & {
  folder: string | null;
  rootFolderId?: number | null;
};

/**
 * Work out where a download belongs.
 *
 * Prefers the volume's existing folder, so files land next to the rest of the
 * series; a path recorded under another mount goes through COMIC_PATH_MAP.
 * Failing that, builds a folder from the naming template inside the volume's
 * root folder, or the first one set up in Settings → Comics.
 */
export function resolveImportDirectory(volume: ImportVolume): string {
  if (volume.folder) return remapComicPath(volume.folder);

  const rootFolder =
    (volume.rootFolderId != null ? getComicRootFolder(volume.rootFolderId) : null) ??
    getComicRootFolders()[0];
  if (rootFolder) return join(rootFolder.path, generateVolumeFolderName(volume));

  throw new Error(
    'No destination for the download: the volume has no folder and no comic root ' +
      'folder is set up — add one in Settings → Comics'
  );
}

export function resolveImportTarget(volume: ImportVolume, filename: string): ImportTarget {
  const directory = resolveImportDirectory(volume);
  return { directory, path: join(directory, filename) };
}

/**
 * Walk up from `directory` to the first path that exists.
 *
 * `mkdir -p` fails on the shallowest folder it could not create, so the
 * permissions that actually blocked it belong to that folder's parent — the
 * deepest ancestor already on disk.
 */
function nearestExistingAncestor(directory: string): string {
  let candidate = directory;
  while (!existsSync(candidate)) {
    const parent = dirname(candidate);
    if (parent === candidate) break;
    candidate = parent;
  }
  return candidate;
}

/**
 * Explain a destination that is not on any mount, naming what would fix it.
 *
 * Nobody keeps a comic library in the filesystem root, so a path with nothing
 * on disk above it is either a mount that is not there, or a folder recorded
 * under another machine's mount for COMIC_PATH_MAP to translate.
 */
function missingMount(volume: ImportVolume, directory: string): Error {
  const { root } = parse(directory);
  const topLevel = root + directory.slice(root.length).split(sep)[0];

  if (!volume.folder) {
    return new Error(
      `Cannot file into ${directory}: ${topLevel} does not exist here. Mount your comic ` +
        'library there, or point the root folder in Settings → Comics at where it is mounted.'
    );
  }

  // The recorded folder is worth naming: it is what COMIC_PATH_MAP translates,
  // and after a remap the path that failed is no longer the one on record.
  const { pathMap } = getServiceConfig().comicPaths;
  const recorded = directory === volume.folder ? '' : ` (remapped from ${volume.folder})`;
  const current = pathMap
    ? ` COMIC_PATH_MAP is currently ${pathMap}.`
    : ' COMIC_PATH_MAP is not set.';

  return new Error(
    `Cannot file into ${directory}${recorded}: ${topLevel} does not exist here. Mount the ` +
      `comic library at ${topLevel}, or set COMIC_PATH_MAP=${topLevel}:<where it is mounted> ` +
      `to translate the recorded folder.${current}`
  );
}

/**
 * Check the library folder can be written to, creating it if need be.
 *
 * Called before a download starts as well as during the import: without the
 * up-front check a wrongly-owned bind mount downloads the whole file and only
 * then fails on the move into place.
 */
export async function ensureImportable(volume: ImportVolume): Promise<string> {
  const directory = resolveImportDirectory(volume);

  // Nothing along the path exists, so it is not on any mount. Checked before
  // the mkdir rather than on its failure: running as root the mkdir would
  // succeed, filling the container's own filesystem with comics that vanish
  // with it, and running as anyone else it fails on `/`, whose permissions are
  // not the fix.
  if (nearestExistingAncestor(directory) === parse(directory).root) {
    throw missingMount(volume, directory);
  }

  try {
    await mkdir(directory, { recursive: true });
  } catch (error) {
    // A new volume's folder does not exist yet, so it is the library root that
    // denied us. Naming the folder we failed to create would send someone off
    // to `chown` a path that isn't there.
    throw describeWriteFailure(nearestExistingAncestor(directory), error, 'create a folder in');
  }

  try {
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
  volume: ImportVolume
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
