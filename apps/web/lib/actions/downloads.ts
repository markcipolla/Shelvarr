'use server';

import { revalidatePath } from 'next/cache';
import {
  searchAllSources,
  searchSource,
  getSearchLinks,
  getSourceStatuses,
  refreshSourceStatuses,
  checkSourceHealth,
  getParserHealth,
  type DownloadResult,
  type DownloadSource,
  type SourceStatus,
  type BlockedSource,
  type ParserHealth,
} from '@/lib/services/downloads';
import {
  getDownloadSourceConfigs,
  getDownloadSourceConfig,
  upsertDownloadSourceConfig,
  type DownloadSourceConfig,
} from '@/lib/db';
import { authenticateZLibrary } from '@/lib/services/downloads/zlibrary';
import { enqueueTask } from '@/lib/services/queue';

// Types are re-exported from the service layer for consumers
// Import types directly from '@/lib/services/downloads' or '@/lib/db' instead

/**
 * Search all download sources for a book
 */
export async function searchDownloads(
  query: string,
  options?: { isbn?: string; sources?: DownloadSource[] }
): Promise<{
  success: boolean;
  results?: DownloadResult[];
  blockedSources?: BlockedSource[];
  error?: string;
}> {
  try {
    const { results, blockedSources } = await searchAllSources(query, options);
    return { success: true, results, blockedSources };
  } catch (error) {
    console.error('Error searching downloads:', error);
    return { success: false, error: 'Search failed' };
  }
}

/**
 * Search a specific download source
 */
export async function searchDownloadSource(
  source: DownloadSource,
  query: string,
  options?: { isbn?: string }
): Promise<{
  success: boolean;
  results?: DownloadResult[];
  blockedSources?: BlockedSource[];
  error?: string;
}> {
  try {
    const { results, blockedSources } = await searchSource(source, query, options);
    return { success: true, results, blockedSources };
  } catch (error) {
    console.error(`Error searching ${source}:`, error);
    return { success: false, error: `Search on ${source} failed` };
  }
}

/**
 * Get search links for all sources (no API calls, instant)
 */
export async function getDownloadSearchLinks(query: string): Promise<{
  zlibrary: string;
  annas: string;
  libgen: string;
}> {
  return getSearchLinks(query);
}

/**
 * Get current source statuses (cached)
 */
export async function getDownloadSourceStatuses(forceRefresh = false): Promise<SourceStatus[]> {
  return getSourceStatuses(forceRefresh);
}

/**
 * Refresh source statuses by probing each source
 */
export async function refreshDownloadSourceStatuses(): Promise<{ success: boolean }> {
  try {
    await refreshSourceStatuses();
    revalidatePath('/wanted');
    revalidatePath('/settings');
    return { success: true };
  } catch (error) {
    console.error('Error refreshing source statuses:', error);
    return { success: false };
  }
}

/**
 * Check health of a specific source (direct check, not from cache)
 */
export async function checkDownloadSourceHealth(source: string): Promise<SourceStatus> {
  const status = await checkSourceHealth(source);
  revalidatePath('/settings');
  return status;
}

/**
 * Get each shadow-library source's consecutive structural-parse-failure
 * streak (in-memory, process-local — see `getParserHealth`). Used to flag a
 * source whose parser may need updating for a markup change.
 */
export async function getDownloadParserHealth(): Promise<ParserHealth[]> {
  return getParserHealth();
}

/**
 * Get download source configurations
 */
export async function getDownloadConfigs(): Promise<DownloadSourceConfig[]> {
  return getDownloadSourceConfigs();
}

/**
 * Get configuration for a specific source
 */
export async function getDownloadConfig(source: string): Promise<DownloadSourceConfig | null> {
  return getDownloadSourceConfig(source);
}

/**
 * Update download source configuration
 */
export async function updateDownloadConfig(
  source: string,
  enabled: boolean,
  credentials?: { email?: string; password?: string }
): Promise<{ success: boolean; error?: string }> {
  try {
    upsertDownloadSourceConfig(source, enabled, credentials);
    revalidatePath('/settings');
    return { success: true };
  } catch (error) {
    console.error('Error updating download config:', error);
    return { success: false, error: 'Failed to update configuration' };
  }
}

/**
 * Enable or disable a download source
 */
export async function toggleDownloadSource(
  source: string,
  enabled: boolean
): Promise<{ success: boolean; error?: string }> {
  try {
    const existing = getDownloadSourceConfig(source);
    const credentials = existing?.credentials ? JSON.parse(existing.credentials) : undefined;
    upsertDownloadSourceConfig(source, enabled, credentials);
    revalidatePath('/settings');
    return { success: true };
  } catch (error) {
    console.error('Error toggling download source:', error);
    return { success: false, error: 'Failed to toggle source' };
  }
}

/**
 * Save Z-Library credentials and authenticate
 */
export async function saveZLibraryCredentials(
  email: string,
  password: string
): Promise<{ success: boolean; error?: string }> {
  try {
    // Try to authenticate
    const authResult = await authenticateZLibrary(email, password);

    if (authResult) {
      // Save credentials with session tokens
      upsertDownloadSourceConfig('zlibrary', true, {
        email,
        password,
        remix_userid: authResult.remix_userid,
        remix_userkey: authResult.remix_userkey,
      });
      revalidatePath('/settings');
      return { success: true };
    }

    // Authentication failed, still save credentials but without tokens
    upsertDownloadSourceConfig('zlibrary', true, { email, password });
    revalidatePath('/settings');
    return { success: false, error: 'Authentication failed, credentials saved but downloads may not work' };
  } catch (error) {
    console.error('Error saving Z-Library credentials:', error);
    return { success: false, error: 'Failed to save credentials' };
  }
}

/**
 * Test connection to a download source
 */
export async function testDownloadSource(source: string): Promise<{
  success: boolean;
  status?: 'up' | 'down' | 'degraded';
  responseTime?: number;
  error?: string;
}> {
  try {
    const result = await checkSourceHealth(source);
    return {
      success: result.status === 'up' || result.status === 'degraded',
      status: result.status as 'up' | 'down' | 'degraded',
      responseTime: result.responseTime,
    };
  } catch (error) {
    console.error(`Error testing ${source}:`, error);
    return { success: false, error: `Failed to test ${source}` };
  }
}

/**
 * Clear Z-Library credentials
 */
export async function clearZLibraryCredentials(): Promise<{ success: boolean }> {
  try {
    upsertDownloadSourceConfig('zlibrary', true, undefined);
    revalidatePath('/settings');
    return { success: true };
  } catch (error) {
    console.error('Error clearing Z-Library credentials:', error);
    return { success: false };
  }
}

/**
 * Queue a download task
 */
export async function queueDownload(data: {
  source: 'libgen' | 'annas' | 'zlibrary';
  md5: string;
  title: string;
  author: string;
  extension: string;
  libraryId: number;
  wantedBookId?: number;
}): Promise<{ success: boolean; taskId?: number; error?: string }> {
  try {
    if (!data.source || !data.md5 || !data.libraryId) {
      return { success: false, error: 'Missing required fields' };
    }

    const task = enqueueTask('download', {
      source: data.source,
      md5: data.md5,
      title: data.title,
      author: data.author,
      extension: data.extension,
      libraryId: data.libraryId,
      wantedBookId: data.wantedBookId,
    });

    revalidatePath('/tasks');
    revalidatePath('/wanted');

    return { success: true, taskId: task.id };
  } catch (error) {
    console.error('Error queuing download:', error);
    return { success: false, error: 'Failed to queue download' };
  }
}

// ---------------------------------------------------------------------------
// Download queue (E2-5)
//
// The book equivalent of getComicDownloadQueue/cancelComicDownload/
// retryComicDownload/unblockComicLink in lib/actions/comics.ts, backing
// /downloads the way those back /comics/downloads.
// ---------------------------------------------------------------------------

export interface BookDownloadQueueView {
  downloads: Array<{
    id: number;
    title: string;
    author: string | null;
    source: string;
    state: string;
    progress: number;
    size: number | null;
    attempts: number;
    /** Fallback mirrors left to try if the current one dies. */
    alternates: number;
    error: string | null;
    createdAt: string;
    libraryId: number;
    libraryName: string | null;
  }>;
  history: Array<{
    id: number;
    title: string | null;
    author: string | null;
    source: string | null;
    success: boolean;
    downloadedAt: string;
  }>;
  blocklist: Array<{
    id: number;
    downloadUrl: string;
    title: string | null;
    reason: string;
    addedAt: string;
  }>;
}

/** The book download queue, recent history, and the blocklist. */
export async function getBookDownloadQueue(): Promise<BookDownloadQueueView> {
  const {
    getBookBlocklist,
    getBookDownloadHistory,
    getBookDownloads,
    query: dbQuery,
    sqlTimeToIso,
  } = await import('@/lib/db');

  const libraries = new Map(
    dbQuery<{ id: number; name: string }>('SELECT id, name FROM libraries').map((row) => [
      row.id,
      row.name,
    ])
  );

  return {
    downloads: getBookDownloads({ limit: 200 }).map((download) => ({
      id: download.id,
      title: download.title,
      author: download.author,
      source: download.source,
      state: download.state,
      progress: download.progress,
      size: download.size,
      attempts: download.attempts,
      alternates: download.alternateLinks.length,
      error: download.error,
      createdAt: download.createdAt,
      libraryId: download.libraryId,
      libraryName: libraries.get(download.libraryId) ?? null,
    })),
    history: (
      getBookDownloadHistory(25) as Array<{
        id: number;
        title: string | null;
        author: string | null;
        source: string | null;
        success: number;
        downloaded_at: string;
      }>
    ).map((entry) => ({
      id: entry.id,
      title: entry.title,
      author: entry.author,
      source: entry.source,
      success: entry.success === 1,
      downloadedAt: sqlTimeToIso(entry.downloaded_at),
    })),
    blocklist: getBookBlocklist(50).map((entry) => ({
      id: entry.id,
      downloadUrl: entry.downloadUrl,
      title: entry.title,
      reason: entry.reason,
      addedAt: entry.addedAt,
    })),
  };
}

/**
 * Cancel a download, or clear a finished one out of the queue.
 *
 * Mirrors `cancelComicDownload`: a download that is still running is marked
 * cancelled rather than deleted, so the running task notices at its next
 * progress checkpoint and stops.
 */
export async function cancelBookDownload(
  id: number
): Promise<{ success: boolean; error?: string }> {
  const { getBookDownload } = await import('@/lib/db');
  const { bookDownloadEvents } = await import('@shelvarr/services');

  const download = getBookDownload(id);
  if (!download) return { success: false, error: 'Download not found' };

  if (
    download.state === 'queued' ||
    download.state === 'downloading' ||
    download.state === 'importing'
  ) {
    bookDownloadEvents.setDownloadState(id, 'cancelled');
  } else {
    bookDownloadEvents.removeDownload(id);
  }

  revalidatePath('/downloads');
  return { success: true };
}

/**
 * Drive a download again from the top: attempts and progress cleared, state
 * back to queued, and a fresh task started.
 *
 * Mirrors `retryComicDownload`, re-enqueuing the same `download` task shape
 * `bookResumeHandler` uses to resume an interrupted download — carrying
 * `bookDownloadId` plus the row's own stored fields, so the task drives this
 * row (and its `.partial` file on disk) instead of starting a new one.
 */
export async function retryBookDownload(
  id: number
): Promise<{ success: boolean; error?: string }> {
  const { getBookDownload } = await import('@/lib/db');
  const { bookDownloadEvents, queue } = await import('@shelvarr/services');

  const download = getBookDownload(id);
  if (!download) return { success: false, error: 'Download not found' };

  if (
    download.state === 'downloading' ||
    download.state === 'importing' ||
    download.state === 'queued'
  ) {
    return { success: false, error: `Download is already ${download.state}` };
  }

  bookDownloadEvents.resetDownloadForRetry(id);
  queue.enqueueTask('download', {
    bookDownloadId: id,
    source: download.source,
    md5: download.md5,
    title: download.title,
    author: download.author,
    extension: download.extension,
    libraryId: download.libraryId,
    wantedBookId: download.wantedBookId ?? undefined,
  });

  revalidatePath('/downloads');
  return { success: true };
}

/** Let a previously-dead link be tried again. */
export async function unblockBookLink(id: number): Promise<{ success: boolean }> {
  const { removeFromBookBlocklist } = await import('@/lib/db');

  removeFromBookBlocklist(id);
  revalidatePath('/downloads');
  return { success: true };
}
