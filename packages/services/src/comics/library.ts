/**
 * Owning the comic library: adding volumes from ComicVine, refreshing their
 * metadata, and removing them.
 *
 * Derived from Kapowarr (GPL-3.0) `backend/implementations/volumes.py` —
 * see NOTICE.md.
 */

import { existsSync } from 'fs';
import { mkdir, rm } from 'fs/promises';
import { join } from 'path';

import {
  addComicRootFolder,
  countVolumesInRootFolder,
  deleteComicRootFolder,
  getComicRootFolder,
  getComicRootFolders,
  getComicVolume,
  getComicVolumeByComicvineId,
  getComicVolumeCover,
  getComicVolumeFileStats,
  getManagedComicVolumes,
  getSetting,
  refreshComicVolumeStats,
  replaceComicIssuesFromMetadata,
  setComicVolumeCover,
  setComicVolumeFolder,
  setComicVolumeMonitored,
  upsertManagedComicVolume,
  execute,
} from '@shelvarr/db';
import type {
  ComicRootFolder,
  ComicVolume,
  ComicVolumeMetadata,
  ComicVolumeSearchResult,
  SpecialVersion,
} from '@shelvarr/types';

import { getServiceConfig } from '../config';
import { createLogger } from '../utils/logger';
import { ComicVine, InvalidComicVineApiKeyError } from './comicvine/index';
import { generateVolumeFolderName } from './naming';
import { scanVolumeFiles } from './scan';

const log = createLogger('comics-library');

/**
 * Build a ComicVine client from the stored API key.
 *
 * The key lives in the settings table rather than the environment, because
 * it's entered through the UI rather than being a deployment concern.
 */
export async function getComicVine(signal?: AbortSignal): Promise<ComicVine> {
  const apiKey =
    (await getSetting<string>('comicvine_api_key', null)) ||
    process.env['COMICVINE_API_KEY'] ||
    null;

  if (!apiKey) {
    throw new InvalidComicVineApiKeyError();
  }

  const dateType = (await getSetting<string>('comicvine_date_type', 'cover_date')) as
    | 'cover_date'
    | 'store_date';

  return new ComicVine({ apiKey, dateType, ...(signal ? { signal } : {}) });
}

/** Whether a ComicVine key has been configured at all. */
export async function isComicVineConfigured(): Promise<boolean> {
  const apiKey =
    (await getSetting<string>('comicvine_api_key', null)) ||
    process.env['COMICVINE_API_KEY'] ||
    null;
  return Boolean(apiKey);
}

// region Root folders
export function listRootFolders(): ComicRootFolder[] {
  return getComicRootFolders();
}

/** Register a root folder, creating the directory if it isn't there yet. */
export async function addRootFolder(path: string): Promise<ComicRootFolder> {
  await mkdir(path, { recursive: true });
  return addComicRootFolder(path);
}

/**
 * Remove a root folder. Refuses while volumes still live in it, so the
 * library can't be orphaned by a stray click.
 */
export function removeRootFolder(id: number): void {
  const inUse = countVolumesInRootFolder(id);
  if (inUse > 0) {
    throw new Error(
      `Root folder still holds ${inUse} volume${inUse === 1 ? '' : 's'}; move or delete them first`
    );
  }
  if (!deleteComicRootFolder(id)) throw new Error(`Root folder ${id} not found`);
}
// endregion

// region Search and add
/**
 * Search ComicVine, flagging anything already in the library so the UI can
 * offer "go to" rather than "add".
 */
export async function searchComicVine(
  query: string,
  signal?: AbortSignal
): Promise<ComicVolumeSearchResult[]> {
  const client = await getComicVine(signal);
  const results = await client.searchVolumes(query);

  return results.map((metadata) => ({
    ...metadata,
    alreadyAdded: getComicVolumeByComicvineId(metadata.comicvineId)?.id ?? null,
  }));
}

export interface AddVolumeInput {
  comicvineId: number | string;
  rootFolderId: number;
  monitored?: boolean;
  monitorNewIssues?: boolean;
  specialVersion?: SpecialVersion | null;
  /** Use this folder instead of the one the naming template would produce. */
  folder?: string;
  signal?: AbortSignal;
}

export interface AddVolumeResult {
  volumeId: number;
  title: string;
  folder: string;
  issueCount: number;
  /** Files already sitting in the folder that got matched on the first scan. */
  matchedFiles: number;
}

/**
 * Add a volume to the library: fetch its metadata and issues from ComicVine,
 * create its folder, and scan for files that are already there.
 *
 * Adding a volume that's already present refreshes it instead of duplicating.
 */
export async function addVolume(input: AddVolumeInput): Promise<AddVolumeResult> {
  const rootFolder = getComicRootFolder(input.rootFolderId);
  if (!rootFolder) throw new Error(`Root folder ${input.rootFolderId} not found`);

  const client = await getComicVine(input.signal);
  const metadata = await client.fetchVolume(input.comicvineId);

  const existing = getComicVolumeByComicvineId(metadata.comicvineId);
  if (existing) {
    log.info('Volume already in library; refreshing instead', {
      volumeId: existing.id,
      comicvineId: metadata.comicvineId,
    });
    const refreshed = await refreshVolume(existing.id, { signal: input.signal });
    return {
      volumeId: existing.id,
      title: metadata.title,
      folder: existing.folder ?? '',
      issueCount: refreshed.issueCount,
      matchedFiles: refreshed.matchedFiles,
    };
  }

  const folder =
    input.folder ??
    join(
      rootFolder.path,
      generateVolumeFolderName({
        title: metadata.title,
        year: metadata.year,
        volumeNumber: metadata.volumeNumber,
        publisher: metadata.publisher,
        specialVersion: input.specialVersion ?? null,
      })
    );

  const cover = await client.fetchCover(metadata.coverLink);

  const volumeId = upsertManagedComicVolume({
    metadata,
    rootFolderId: rootFolder.id,
    folder,
    monitored: input.monitored ?? true,
    monitorNewIssues: input.monitorNewIssues ?? true,
    customFolder: Boolean(input.folder),
    specialVersion: input.specialVersion ?? null,
    cover,
  });

  replaceComicIssuesFromMetadata(volumeId, metadata.issues ?? []);
  await mkdir(folder, { recursive: true });

  const scan = await scanVolumeFiles(volumeId);
  refreshComicVolumeStats(volumeId);

  log.info('Added volume', { volumeId, title: metadata.title, folder });

  return {
    volumeId,
    title: metadata.title,
    folder,
    issueCount: metadata.issues?.length ?? 0,
    matchedFiles: scan.matched,
  };
}
// endregion

// region Refresh
export interface RefreshVolumeResult {
  volumeId: number;
  issueCount: number;
  issuesAdded: number;
  issuesTombstoned: number;
  matchedFiles: number;
}

/**
 * Re-fetch a volume's metadata and issues from ComicVine, then rescan its
 * folder.
 *
 * The user's own choices — monitoring, a hand-picked folder, a locked special
 * version — are not touched.
 */
export async function refreshVolume(
  volumeId: number,
  options: { signal?: AbortSignal; skipScan?: boolean } = {}
): Promise<RefreshVolumeResult> {
  const volume = getComicVolume(volumeId);
  if (!volume) throw new Error(`Comic volume ${volumeId} not found`);
  if (!volume.comicvineId) {
    throw new Error(`Comic volume ${volumeId} has no ComicVine id to refresh from`);
  }

  const client = await getComicVine(options.signal);
  const metadata = await client.fetchVolume(volume.comicvineId);

  upsertManagedComicVolume({
    id: volumeId,
    metadata,
    rootFolderId: volume.rootFolderId,
    folder: volume.folder,
  });

  // Issues that appear after the volume was added inherit its
  // monitor-new-issues preference rather than defaulting to monitored.
  const issueChanges = replaceComicIssuesFromMetadata(volumeId, metadata.issues ?? [], {
    monitorNewIssues: volume.monitorNewIssues,
  });

  if (getComicVolumeCover(volumeId) === null) {
    setComicVolumeCover(volumeId, await client.fetchCover(metadata.coverLink));
  }

  const scan = options.skipScan
    ? { matched: 0 }
    : await scanVolumeFiles(volumeId);
  refreshComicVolumeStats(volumeId);

  log.info('Refreshed volume', {
    volumeId,
    added: issueChanges.inserted,
    tombstoned: issueChanges.tombstoned,
  });

  return {
    volumeId,
    issueCount: metadata.issues?.length ?? 0,
    issuesAdded: issueChanges.inserted,
    issuesTombstoned: issueChanges.tombstoned,
    matchedFiles: scan.matched,
  };
}
// endregion

// region Mutations
export function setMonitored(volumeId: number, monitored: boolean): void {
  if (!getComicVolume(volumeId)) throw new Error(`Comic volume ${volumeId} not found`);
  setComicVolumeMonitored(volumeId, monitored);
}

/** Move a volume to a different folder, taking its files with it. */
export function setFolder(volumeId: number, folder: string, custom = true): void {
  if (!getComicVolume(volumeId)) throw new Error(`Comic volume ${volumeId} not found`);
  setComicVolumeFolder(volumeId, folder, custom);
}

export interface DeleteVolumeOptions {
  /** Also remove the volume's folder from disk. Off by default. */
  deleteFiles?: boolean;
}

/**
 * Remove a volume from the library. The row is tombstoned rather than deleted
 * so the native app's cached ids and any read progress stay meaningful.
 */
export async function deleteVolume(
  volumeId: number,
  options: DeleteVolumeOptions = {}
): Promise<void> {
  const volume = getComicVolume(volumeId);
  if (!volume) throw new Error(`Comic volume ${volumeId} not found`);

  if (options.deleteFiles && volume.folder && existsSync(volume.folder)) {
    log.info('Deleting volume folder', { volumeId, folder: volume.folder });
    await rm(volume.folder, { recursive: true, force: true });
  }

  execute(
    "UPDATE comics SET deleted_at = CURRENT_TIMESTAMP, monitored = 0 WHERE id = ?",
    [volumeId]
  );
  execute('DELETE FROM comic_files WHERE volume_id = ?', [volumeId]);

  log.info('Deleted volume', { volumeId, deletedFiles: Boolean(options.deleteFiles) });
}
// endregion

/** Every volume Shelvarr owns, with its file counts. */
export function listVolumes(): Array<ComicVolume & ReturnType<typeof getComicVolumeFileStats>> {
  return getManagedComicVolumes().map((volume) => ({
    ...volume,
    ...getComicVolumeFileStats(volume.id),
  }));
}

/** The comic library root, for callers that just need somewhere to write. */
export function defaultRootFolderPath(): string | null {
  const folders = getComicRootFolders();
  if (folders.length > 0) return folders[0]!.path;
  return getServiceConfig().getcomics.libraryRoot;
}

export type { ComicVolumeMetadata };
