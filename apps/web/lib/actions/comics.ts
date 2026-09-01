'use server';

import {
  getInProgressComics as dbGetInProgressComics,
  getComicReadProgressForVolume as dbGetComicReadProgressForVolume,
  getCachedComicDetail,
  getManagedComicDetail,
  listComicVolumes,
  type InProgressComic,
  type ComicIssueProgress,
} from '@/lib/db';
import type { ComicVolumeSummary, ComicVolumeDetail } from '@shelvarr/types';

export interface ComicsListResult {
  volumes: Array<ComicVolumeSummary & { managed?: boolean }>;
}

export interface ComicDetailResult {
  /**
   * True when Shelvarr owns this volume. False means it is a leftover mirror
   * from a previous manager, readable but not yet migrated.
   */
  managed: boolean;
  volume: ComicVolumeDetail | null;
  coverUrl: string | null;
}

export async function getComics(search?: string): Promise<ComicsListResult> {
  return { volumes: listComicVolumes({ ...(search ? { search } : {}) }) };
}

export async function getRecentComics(limit: number): Promise<ComicsListResult> {
  return { volumes: listComicVolumes({ sort: 'recently_added' }).slice(0, limit) };
}

/**
 * Volumes the user is partway through reading, most recent first.
 */
export async function getInProgressComics(limit: number): Promise<InProgressComic[]> {
  return dbGetInProgressComics(limit);
}

/** Per-issue read progress for a volume, keyed by issue id. */
export async function getComicProgress(volumeId: number): Promise<ComicIssueProgress[]> {
  return dbGetComicReadProgressForVolume(volumeId);
}

export async function getComic(id: number): Promise<ComicDetailResult> {
  const managed = getManagedComicDetail(id);
  const volume = managed ?? getCachedComicDetail(id);

  return {
    managed: managed !== null,
    volume,
    coverUrl: volume ? `/api/comics/${id}/cover` : null,
  };
}

// ---------------------------------------------------------------------------
// Library management (volumes Shelvarr owns)
// ---------------------------------------------------------------------------

export interface ComicVineSearchResultView {
  comicvineId: number;
  title: string;
  year: number | null;
  volumeNumber: number;
  publisher: string | null;
  issueCount: number;
  description: string;
  coverLink: string | null;
  siteUrl: string;
  alreadyAdded: number | null;
}

/** Search ComicVine for a volume to add to the library. */
export async function searchComicVineAction(query: string): Promise<{
  configured: boolean;
  results: ComicVineSearchResultView[];
  error?: string;
}> {
  const { comicLibrary } = await import('@shelvarr/services');

  if (!(await comicLibrary.isComicVineConfigured())) {
    return { configured: false, results: [] };
  }

  try {
    const results = await comicLibrary.searchComicVine(query);
    return {
      configured: true,
      results: results.map((result) => ({
        comicvineId: result.comicvineId,
        title: result.title,
        year: result.year,
        volumeNumber: result.volumeNumber,
        publisher: result.publisher,
        issueCount: result.issueCount,
        description: result.description,
        coverLink: result.coverLink,
        siteUrl: result.siteUrl,
        alreadyAdded: result.alreadyAdded,
      })),
    };
  } catch (error) {
    return {
      configured: true,
      results: [],
      error: error instanceof Error ? error.message : 'ComicVine search failed',
    };
  }
}

/** Root folders a new volume can be filed under. */
export async function getComicRootFoldersAction(): Promise<
  Array<{ id: number; path: string }>
> {
  const { comicLibrary } = await import('@shelvarr/services');
  return comicLibrary.listRootFolders();
}

/** Add a volume from ComicVine and scan its folder for files already there. */
export async function addComicVolumeAction(
  comicvineId: number,
  rootFolderId?: number
): Promise<{ success: boolean; volumeId?: number; error?: string }> {
  const { comicLibrary } = await import('@shelvarr/services');
  const { revalidatePath } = await import('next/cache');

  const targetRoot = rootFolderId ?? comicLibrary.listRootFolders()[0]?.id;
  if (targetRoot === undefined) {
    return {
      success: false,
      error: 'Add a comic root folder in Settings → Comics first',
    };
  }

  try {
    const result = await comicLibrary.addVolume({ comicvineId, rootFolderId: targetRoot });
    revalidatePath('/comics');
    return { success: true, volumeId: result.volumeId };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to add volume',
    };
  }
}

type VolumeJob = 'refresh' | 'scan' | 'rename' | 'search';

const VOLUME_JOB_TASKS: Record<VolumeJob, string> = {
  refresh: 'comic_refresh',
  scan: 'comic_scan',
  rename: 'comic_rename',
  search: 'comic_search',
};

/**
 * Queue one of the per-volume jobs. Each returns a task id so the caller can
 * watch it on the Tasks page.
 */
export async function runComicVolumeJob(
  volumeId: number,
  job: VolumeJob
): Promise<{ success: boolean; taskId?: number; error?: string }> {
  const { queue } = await import('@shelvarr/services');
  const { revalidatePath } = await import('next/cache');

  const type = VOLUME_JOB_TASKS[job];
  if (!type) return { success: false, error: `Unknown job: ${job}` };

  const task = queue.enqueueTask(type as never, { volumeId });
  revalidatePath(`/comics/${volumeId}`);
  return { success: true, taskId: task.id };
}

/** What a rename would do, so the user can look before leaping. */
export async function previewComicRename(volumeId: number) {
  const { comicRename } = await import('@shelvarr/services');

  try {
    return { success: true as const, preview: comicRename.previewVolumeRename(volumeId) };
  } catch (error) {
    return {
      success: false as const,
      error: error instanceof Error ? error.message : 'Failed to preview rename',
    };
  }
}

/** Remove a volume from the library, optionally deleting its files. */
export async function deleteComicVolumeAction(
  volumeId: number,
  deleteFiles = false
): Promise<{ success: boolean; error?: string }> {
  const { comicLibrary } = await import('@shelvarr/services');
  const { revalidatePath } = await import('next/cache');

  try {
    await comicLibrary.deleteVolume(volumeId, { deleteFiles });
    revalidatePath('/comics');
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to delete volume',
    };
  }
}

// ---------------------------------------------------------------------------
// Download queue
// ---------------------------------------------------------------------------

export interface DownloadQueueView {
  downloads: Array<{
    id: number;
    volumeId: number;
    volumeTitle: string | null;
    host: string;
    webTitle: string | null;
    webSubTitle: string | null;
    state: string;
    progress: number;
    size: number | null;
    attempts: number;
    /** Fallback links left to try if the current one dies. */
    alternates: number;
    error: string | null;
    createdAt: string;
  }>;
  history: Array<{
    id: number;
    volumeTitle: string | null;
    fileTitle: string | null;
    host: string | null;
    success: boolean;
    downloadedAt: string;
  }>;
  blocklist: Array<{
    id: number;
    downloadLink: string;
    webTitle: string | null;
    reason: string;
    addedAt: string;
  }>;
}

/** The comic download queue, recent history, and the blocklist. */
export async function getComicDownloadQueue(): Promise<DownloadQueueView> {
  const {
    getComicBlocklist,
    getComicDownloadHistory,
    getComicDownloads,
    query: dbQuery,
  } = await import('@/lib/db');

  const titles = new Map(
    dbQuery<{ id: number; title: string }>('SELECT id, title FROM comics').map((row) => [
      row.id,
      row.title,
    ])
  );

  return {
    downloads: getComicDownloads({ limit: 200 }).map((download) => ({
      id: download.id,
      volumeId: download.volumeId,
      volumeTitle: titles.get(download.volumeId) ?? null,
      host: download.host,
      webTitle: download.webTitle,
      webSubTitle: download.webSubTitle,
      state: download.state,
      progress: download.progress,
      size: download.size,
      attempts: download.attempts,
      alternates: download.alternateLinks.length,
      error: download.error,
      createdAt: download.createdAt,
    })),
    history: (
      getComicDownloadHistory(25) as Array<{
        id: number;
        volume_id: number | null;
        file_title: string | null;
        host: string | null;
        success: number;
        downloaded_at: string;
      }>
    ).map((entry) => ({
      id: entry.id,
      volumeTitle: entry.volume_id !== null ? titles.get(entry.volume_id) ?? null : null,
      fileTitle: entry.file_title,
      host: entry.host,
      success: entry.success === 1,
      downloadedAt: entry.downloaded_at,
    })),
    blocklist: getComicBlocklist(50).map((entry) => ({
      id: entry.id,
      downloadLink: entry.downloadLink,
      webTitle: entry.webTitle,
      reason: entry.reason,
      addedAt: entry.addedAt,
    })),
  };
}

/**
 * Cancel a download, or clear a finished one out of the queue.
 *
 * A download that is still running is marked cancelled rather than deleted;
 * the running task notices at its next progress checkpoint and stops.
 */
export async function cancelComicDownload(
  id: number
): Promise<{ success: boolean; error?: string }> {
  const { deleteComicDownload, getComicDownload, setComicDownloadState } = await import('@/lib/db');
  const { revalidatePath } = await import('next/cache');

  const download = getComicDownload(id);
  if (!download) return { success: false, error: 'Download not found' };

  if (
    download.state === 'queued' ||
    download.state === 'downloading' ||
    download.state === 'importing'
  ) {
    setComicDownloadState(id, 'cancelled');
  } else {
    deleteComicDownload(id);
  }

  revalidatePath('/comics/downloads');
  return { success: true };
}

/**
 * Drive a download again from the top: attempts and progress cleared, state
 * back to queued, and a fresh task started.
 *
 * This is how a download that ran out of attempts — a host that kept
 * rate-limiting us, say — gets another go without searching again.
 */
export async function retryComicDownload(
  id: number
): Promise<{ success: boolean; error?: string }> {
  const { getComicDownload, resetComicDownloadForRetry } = await import('@/lib/db');
  const { queue } = await import('@shelvarr/services');
  const { revalidatePath } = await import('next/cache');

  const download = getComicDownload(id);
  if (!download) return { success: false, error: 'Download not found' };

  if (
    download.state === 'downloading' ||
    download.state === 'importing' ||
    download.state === 'queued'
  ) {
    return { success: false, error: `Download is already ${download.state}` };
  }

  resetComicDownloadForRetry(id);
  queue.enqueueTask('comic_download', { comicDownloadId: id });

  revalidatePath('/comics/downloads');
  return { success: true };
}

/** Let a previously-dead link be tried again. */
export async function unblockComicLink(id: number): Promise<{ success: boolean }> {
  const { removeFromComicBlocklist } = await import('@/lib/db');
  const { revalidatePath } = await import('next/cache');

  removeFromComicBlocklist(id);
  revalidatePath('/comics/downloads');
  return { success: true };
}

// ---------------------------------------------------------------------------
// Library import review
// ---------------------------------------------------------------------------

export interface ImportCandidateView {
  comicvineId: number;
  title: string;
  year: number | null;
  volumeNumber: number;
  publisher: string | null;
  issueCount: number;
}

export interface ImportProposalView {
  folder: string;
  series: string;
  year: number | null;
  fileCount: number;
  suggestedComicvineId: number | null;
  alreadyAdded: number | null;
  candidates: ImportCandidateView[];
}

export interface LibraryImportRun {
  taskId: number;
  status: string;
  path: string | null;
  progress: number;
  total: number | null;
  error: string | null;
  proposals: ImportProposalView[];
}

/**
 * The most recent library-import scan, with the matches it proposed.
 *
 * Proposals live in the task's result rather than a table of their own: they
 * are the output of one scan, superseded by the next, and never referenced
 * once the folders have been adopted.
 */
export async function getLatestLibraryImport(): Promise<LibraryImportRun | null> {
  const { queryOne: dbQueryOne } = await import('@/lib/db');

  const row = dbQueryOne<{
    id: number;
    status: string;
    progress: number;
    total: number | null;
    result: string | null;
    error: string | null;
  }>(
    `SELECT id, status, progress, total, result, error
       FROM tasks
      WHERE type = 'comic_library_import'
      ORDER BY id DESC
      LIMIT 1`
  );
  if (!row) return null;

  let path: string | null = null;
  let proposals: ImportProposalView[] = [];
  if (row.result) {
    try {
      const parsed = JSON.parse(row.result) as {
        path?: string;
        proposals?: ImportProposalView[];
      };
      path = parsed.path ?? null;
      proposals = parsed.proposals ?? [];
    } catch {
      // A half-written result just means there is nothing to review yet.
    }
  }

  return {
    taskId: row.id,
    status: row.status,
    path,
    progress: row.progress,
    total: row.total,
    error: row.error,
    proposals,
  };
}

/** Adopt the chosen folders. Each keeps the folder it is already in. */
export async function applyLibraryImportAction(
  selections: Array<{ folder: string; comicvineId: number }>,
  rootFolderId?: number
): Promise<{
  success: boolean;
  imported?: number;
  failed?: Array<{ folder: string; error: string }>;
  error?: string;
}> {
  const { comicLibrary, comicLibraryImport } = await import('@shelvarr/services');
  const { revalidatePath } = await import('next/cache');

  if (selections.length === 0) {
    return { success: false, error: 'Nothing selected' };
  }

  const targetRoot = rootFolderId ?? comicLibrary.listRootFolders()[0]?.id;
  if (targetRoot === undefined) {
    return { success: false, error: 'Add a comic root folder in Settings → Comics first' };
  }

  try {
    const result = await comicLibraryImport.applyLibraryImport(selections, targetRoot);
    revalidatePath('/comics');
    revalidatePath('/comics/import');
    return {
      success: true,
      imported: result.imported.length,
      failed: result.failed,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Library import failed',
    };
  }
}
