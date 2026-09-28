/**
 * Owning the comic library: adding volumes from ComicVine, refreshing their
 * metadata, and removing them.
 *
 * Derived from Kapowarr (GPL-3.0) `backend/implementations/volumes.py` —
 * see NOTICE.md.
 */

import { existsSync } from 'fs';
import { mkdir, rm } from 'fs/promises';
import { dirname, join } from 'path';

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
  getComicVolumeFolders,
  getComicVolumeIdentities,
  getManagedComicVolumes,
  getSetting,
  refreshComicVolumeStats,
  replaceComicIssuesFromMetadata,
  retargetComicVolume,
  setComicVolumeCover,
  setComicVolumeFolder,
  setComicVolumeMonitored,
  upsertManagedComicVolume,
  execute,
} from '@shelvarr/db';
import type { ComicFolderOwner, ComicVolumeIdentity } from '@shelvarr/db';
import type {
  ComicRootFolder,
  ComicVolume,
  ComicVolumeMetadata,
  ComicVolumeSearchResult,
  SpecialVersion,
} from '@shelvarr/types';

import { describeWriteFailure } from '../utils/fs-errors';
import { createLogger } from '../utils/logger';
import { remapComicPath } from './archive';
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
  const apiKey = await getSetting<string>('comicvine_api_key', null);

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
  return Boolean(await getSetting<string>('comicvine_api_key', null));
}

/** Trailing separators aside, the same folder is the same folder. */
export function sameFolderKey(folder: string): string {
  return folder.replace(/[\\/]+$/, '');
}

/**
 * Volumes that already hold a folder, keyed by where that folder is on this
 * machine — a recorded folder can be under another mount, which is what
 * COMIC_PATH_MAP translates.
 */
export function comicFolderOwners(): Map<string, ComicFolderOwner> {
  const owners = new Map<string, ComicFolderOwner>();
  for (const volume of getComicVolumeFolders()) {
    owners.set(sameFolderKey(remapComicPath(volume.folder)), volume);
  }
  return owners;
}

/**
 * Take a volume out of the library without losing it.
 *
 * The row is tombstoned rather than deleted so the native app's cached ids and
 * any read progress stay meaningful; its file rows go, because they describe
 * what is on disk now and nothing else references them.
 */
function tombstoneVolume(volumeId: number): void {
  execute('UPDATE comics SET deleted_at = CURRENT_TIMESTAMP, monitored = 0 WHERE id = ?', [
    volumeId,
  ]);
  execute('DELETE FROM comic_files WHERE volume_id = ?', [volumeId]);
}

export interface MergeDuplicateVolumesResult {
  /** Folders that were held by more than one volume. */
  folders: number;
  /** ComicVine ids held by more than one volume, folders aside. */
  ids: number;
  /** Volume rows tombstoned as the redundant copy. */
  removed: number;
  /** Kept volumes pointed at a ComicVine id a dropped mirror carried. */
  retargeted: number;
  /** Duplicates left for a human: more than one copy holds files of its own. */
  unresolved: Array<{ comicvineId: number; title: string; folders: string[] }>;
}

/**
 * One folder, one volume; one ComicVine volume, one row.
 *
 * Two ways the comics page ends up listing the same series twice, and one pass
 * for each.
 *
 * **Sharing a folder.** Until adding a volume checked the folder as well as the
 * ComicVine id, a folder could end up held by two rows — typically a mirror
 * from a previous manager plus a volume created from a wrong title match —
 * each with a share of its files. The keeper is the row with the most to lose:
 * a volume Shelvarr owns before a mirror, then the one with the most files,
 * then the most issues. Where a dropped mirror disagreed about which ComicVine
 * volume this is, the mirror wins: the previous manager's match is a fact, and
 * the row that displaced it was a guess.
 *
 * **Sharing a ComicVine id from different folders.** The same volume adopted
 * twice under two paths — a legacy folder and the one it was migrated to, a
 * rename the old manager made, a second import of a moved library. Here the
 * folders differ, so the pass above cannot see it, and dropping a copy that
 * holds files would lose track of those files while leaving them on disk for
 * the next import to adopt all over again. So only copies holding nothing are
 * dropped; a genuine two-folder split is reported as `unresolved` for someone
 * to settle by removing one.
 *
 * Losers are tombstoned rather than deleted, like any other removed volume.
 * Free of ComicVine requests, so it runs at the top of every library scan
 * rather than waiting to be asked.
 */
export function mergeDuplicateComicVolumes(): MergeDuplicateVolumesResult {
  const byFolder = new Map<string, ComicFolderOwner[]>();
  for (const volume of getComicVolumeFolders()) {
    const key = sameFolderKey(remapComicPath(volume.folder));
    const group = byFolder.get(key);
    if (group) group.push(volume);
    else byFolder.set(key, [volume]);
  }

  const result: MergeDuplicateVolumesResult = {
    folders: 0,
    ids: 0,
    removed: 0,
    retargeted: 0,
    unresolved: [],
  };

  for (const [folder, group] of byFolder) {
    if (group.length < 2) continue;
    result.folders += 1;

    const files = new Map(
      group.map((volume) => [volume.id, getComicVolumeFileStats(volume.id).downloadedCount])
    );
    const ranked = [...group].sort((a, b) => {
      if (a.managed !== b.managed) return a.managed ? -1 : 1;
      const byFiles = (files.get(b.id) ?? 0) - (files.get(a.id) ?? 0);
      if (byFiles !== 0) return byFiles;
      if (a.issueCount !== b.issueCount) return b.issueCount - a.issueCount;
      return a.id - b.id;
    });

    const [keeper, ...dropped] = ranked as [ComicFolderOwner, ...ComicFolderOwner[]];

    const mirror = dropped.find(
      (volume) => !volume.managed && volume.comicvineId !== keeper.comicvineId
    );
    if (mirror) {
      retargetComicVolume(keeper.id, mirror.comicvineId);
      result.retargeted += 1;
    }

    for (const volume of dropped) {
      tombstoneVolume(volume.id);
      result.removed += 1;
    }

    log.info('Merged volumes sharing a folder', {
      folder,
      kept: keeper.id,
      dropped: dropped.map((volume) => volume.id),
      ...(mirror ? { retargetedTo: mirror.comicvineId } : {}),
    });
  }

  // Second pass: the same ComicVine volume held by rows in different folders.
  for (const [comicvineId, group] of groupByComicvineId()) {
    if (group.length < 2) continue;
    result.ids += 1;

    // The row whose files are really there wins, mirror or not: pointing the
    // library at a folder that no longer exists is the worse outcome.
    const onDisk = new Map(group.map((volume) => [volume.id, holdsFilesOnDisk(volume)]));
    const ranked = [...group].sort((a, b) => {
      const byDisk = Number(onDisk.get(b.id)) - Number(onDisk.get(a.id));
      if (byDisk !== 0) return byDisk;
      if (a.managed !== b.managed) return a.managed ? -1 : 1;
      if (a.issueCount !== b.issueCount) return b.issueCount - a.issueCount;
      return a.id - b.id;
    });

    const [keeper, ...dropped] = ranked as [ComicVolumeIdentity, ...ComicVolumeIdentity[]];

    // Files under a folder the keeper does not hold: someone has to say which
    // folder is the volume, and guessing would strand the other one.
    if (dropped.some((volume) => onDisk.get(volume.id))) {
      result.unresolved.push({
        comicvineId,
        title: keeper.title,
        folders: group.map((volume) => volume.folder ?? '(no folder)'),
      });
      continue;
    }

    for (const volume of dropped) {
      tombstoneVolume(volume.id);
      result.removed += 1;
    }

    log.info('Merged volumes sharing a ComicVine id', {
      comicvineId,
      kept: keeper.id,
      dropped: dropped.map((volume) => volume.id),
    });
  }

  if (result.removed > 0 || result.unresolved.length > 0) {
    log.info('Duplicate volumes merged', { ...result });
  }
  return result;
}

/**
 * Whether a copy still has its files where it says they are.
 *
 * A row can claim files that have since moved: a mirror keeps the previous
 * manager's paths, and folders get renamed. Gone is only believed when the
 * parent directory is there — a library that isn't mounted has to read as
 * "cannot tell", or a dedupe would tombstone the whole shelf.
 */
function holdsFilesOnDisk(volume: ComicVolumeIdentity): boolean {
  if (!volume.holdsFiles || volume.folder === null) return false;

  const folder = remapComicPath(volume.folder);
  if (existsSync(folder)) return true;
  return !existsSync(dirname(folder));
}

/** Live volumes carrying a ComicVine id, gathered by the id they carry. */
function groupByComicvineId(): Map<number, ComicVolumeIdentity[]> {
  const byId = new Map<number, ComicVolumeIdentity[]>();
  for (const volume of getComicVolumeIdentities()) {
    const group = byId.get(volume.comicvineId);
    if (group) group.push(volume);
    else byId.set(volume.comicvineId, [volume]);
  }
  return byId;
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

  // One volume per folder, and one volume per ComicVine id. A second row for
  // either means two volumes fighting over the same files — a leftover mirror
  // plus an early wrong match is how the same series ended up listed twice —
  // so adopt whichever row is already there instead of inserting another.
  const existing =
    (input.folder ? comicFolderOwners().get(sameFolderKey(input.folder)) ?? null : null) ??
    getComicVolumeByComicvineId(metadata.comicvineId);

  if (existing) {
    if (existing.comicvineId !== metadata.comicvineId) {
      log.info('Retargeting the volume that already holds this folder', {
        volumeId: existing.id,
        from: existing.comicvineId,
        to: metadata.comicvineId,
      });
    } else {
      log.info('Volume already in library; refreshing instead', {
        volumeId: existing.id,
        comicvineId: metadata.comicvineId,
      });
    }

    // Importing a folder is also a claim on it: a mirror still pointing at the
    // previous manager's path has to follow its files here, or the rescan
    // below finds nothing.
    if (input.folder && existing.folder !== input.folder) {
      setComicVolumeFolder(existing.id, input.folder, true);
    }

    const refreshed = await refreshVolume(existing.id, {
      metadata,
      ...(input.signal ? { signal: input.signal } : {}),
    });
    return {
      volumeId: existing.id,
      title: metadata.title,
      folder: input.folder ?? existing.folder ?? '',
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
  options: {
    signal?: AbortSignal;
    skipScan?: boolean;
    /**
     * Metadata the caller has already fetched. Saves fetching the volume and
     * its issues a second time, and is how an import retargets a row: the
     * metadata's ComicVine id wins over whatever the row carried.
     */
    metadata?: ComicVolumeMetadata;
  } = {}
): Promise<RefreshVolumeResult> {
  const volume = getComicVolume(volumeId);
  if (!volume) throw new Error(`Comic volume ${volumeId} not found`);

  let metadata = options.metadata;
  if (!metadata) {
    if (!volume.comicvineId) {
      throw new Error(`Comic volume ${volumeId} has no ComicVine id to refresh from`);
    }
    const client = await getComicVine(options.signal);
    metadata = await client.fetchVolume(volume.comicvineId);
  }

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
    // Cover images come from ComicVine's CDN rather than its API, so this one
    // is free of the request budget.
    const client = await getComicVine(options.signal);
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
    try {
      await rm(volume.folder, { recursive: true, force: true });
    } catch (error) {
      throw describeWriteFailure(volume.folder, error, 'delete');
    }
  }

  tombstoneVolume(volumeId);

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

export type { ComicVolumeMetadata };
