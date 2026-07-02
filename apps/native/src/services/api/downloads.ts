import { getApiClient } from './client';

export type DownloadSource = 'zlibrary' | 'annas' | 'libgen';

export interface DownloadResult {
  id: string;
  source: DownloadSource;
  title: string;
  author: string;
  extension: string;
  size: string;
  year?: string;
  language?: string;
  downloadUrl?: string;
  searchUrl: string;
  sourceStatus?: 'up' | 'down' | 'degraded' | 'unknown';
  md5?: string;
}

export interface SearchLinks {
  zlibrary: string;
  annas: string;
  libgen: string;
}

export interface DownloadSearchResponse {
  success: boolean;
  results?: DownloadResult[];
  links?: SearchLinks;
  error?: string;
}

export interface DownloadSourceStatus {
  name: string;
  displayName: string;
  status: 'up' | 'down' | 'degraded' | 'unknown';
  responseTime?: number;
  url: string;
}

export interface QueueDownloadInput {
  source: DownloadSource;
  md5: string;
  title: string;
  author: string;
  extension: string;
  libraryId: number;
  wantedBookId?: number;
}

export interface QueueDownloadResponse {
  success: boolean;
  taskId?: number;
  error?: string;
}

/**
 * Search all enabled download sources for a book.
 */
export async function searchDownloads(
  query: string,
  isbn?: string
): Promise<DownloadSearchResponse> {
  const trimmed = query.trim();
  if (!trimmed) return { success: true, results: [] };
  try {
    const { data } = await getApiClient().get<DownloadSearchResponse>('/api/downloads/search', {
      params: isbn ? { q: trimmed, isbn } : { q: trimmed },
    });
    return data;
  } catch (err: any) {
    return {
      success: false,
      error: err?.response?.data?.error || err?.message || 'Download search failed',
    };
  }
}

/**
 * Queue a download task on the server (currently LibGen-backed).
 */
export async function queueDownload(input: QueueDownloadInput): Promise<QueueDownloadResponse> {
  try {
    const { data } = await getApiClient().post<QueueDownloadResponse>(
      '/api/downloads/queue',
      input
    );
    return data;
  } catch (err: any) {
    return {
      success: false,
      error: err?.response?.data?.error || err?.message || 'Failed to queue download',
    };
  }
}

/**
 * Fetch the cached availability of each download source.
 */
export async function getDownloadSourceStatuses(): Promise<DownloadSourceStatus[]> {
  try {
    const { data } = await getApiClient().get<{
      success: boolean;
      statuses?: DownloadSourceStatus[];
    }>('/api/downloads/sources');
    return data.statuses || [];
  } catch {
    return [];
  }
}
