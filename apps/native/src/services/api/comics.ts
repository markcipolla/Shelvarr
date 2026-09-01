import { getApiClient } from './client';
import {
  getCachedComicDetail,
  getCachedComics,
  searchCachedComics,
  upsertComicDetail,
  upsertComicVolumes,
} from '../db/comics';
import type { ComicVolumeSummary, ComicVolumeDetail, ComicIssueSummary } from '@shelvarr/types';

export type { ComicVolumeSummary, ComicVolumeDetail, ComicIssueSummary };

/**
 * Comic responses.
 *
 * `cached` means the payload came from the on-device database because the
 * server could not be reached; `error` carries why.
 */
export interface ComicsListResponse {
  volumes: ComicVolumeSummary[];
  cached?: boolean;
  error?: string;
}

export interface ComicDetailResponse {
  volume?: ComicVolumeDetail;
  cached?: boolean;
  error?: string;
}

export interface ComicIssueResponse {
  issue?: ComicIssueSummary;
  cached?: boolean;
  error?: string;
}

export async function fetchComics(search?: string): Promise<ComicsListResponse> {
  const params: Record<string, string> = {};
  const trimmed = search?.trim();
  if (trimmed) params.search = trimmed;

  try {
    const { data } = await getApiClient().get<ComicsListResponse>('/api/comics', { params });
    if (data.volumes.length > 0 && !trimmed) {
      await upsertComicVolumes(data.volumes);
    }
    return data;
  } catch (err) {
    // Honour the query offline too — falling back to the whole cache would
    // read as "your search matched everything".
    const cached = trimmed ? await searchCachedComics(trimmed) : await getCachedComics();
    if (cached.length > 0) {
      return {
        volumes: cached,
        cached: true,
        error: err instanceof Error ? err.message : 'Network error',
      };
    }
    throw err;
  }
}

export async function fetchRecentComics(limit: number): Promise<ComicsListResponse> {
  try {
    const { data } = await getApiClient().get<ComicsListResponse>('/api/comics', {
      params: { sort: 'recently_added' },
    });
    return { ...data, volumes: data.volumes.slice(0, limit) };
  } catch (err) {
    const cached = await getCachedComics();
    if (cached.length > 0) {
      return {
        volumes: cached.slice(0, limit),
        cached: true,
        error: err instanceof Error ? err.message : 'Network error',
      };
    }
    throw err;
  }
}

export async function fetchComicDetail(volumeId: number): Promise<ComicDetailResponse> {
  try {
    const { data } = await getApiClient().get<ComicDetailResponse>(`/api/comics/${volumeId}`);
    if (data.volume && !data.cached) {
      await upsertComicDetail(data.volume);
    }
    return data;
  } catch (err) {
    const cached = await getCachedComicDetail(volumeId);
    if (cached) {
      return {
        volume: cached,
        cached: true,
        error: err instanceof Error ? err.message : 'Network error',
      };
    }
    throw err;
  }
}

/**
 * Fetch a single issue. Falls back to locating the issue inside the cached
 * volume detail (volumeId) when the network request fails, so the issue
 * screen still works offline.
 */
export async function fetchComicIssue(
  issueId: number,
  volumeId?: number
): Promise<ComicIssueResponse> {
  try {
    const { data } = await getApiClient().get<ComicIssueResponse>(
      `/api/comics/issues/${issueId}`
    );
    if (data.issue) {
      return data;
    }
    const cached = await cachedIssue(issueId, volumeId);
    if (cached) return { issue: cached, cached: true, error: data.error };
    return data;
  } catch (err) {
    const cached = await cachedIssue(issueId, volumeId);
    if (cached) {
      return {
        issue: cached,
        cached: true,
        error: err instanceof Error ? err.message : 'Network error',
      };
    }
    throw err;
  }
}

async function cachedIssue(
  issueId: number,
  volumeId?: number
): Promise<ComicIssueSummary | undefined> {
  if (volumeId === undefined) return undefined;
  const volume = await getCachedComicDetail(volumeId);
  return volume?.issues.find((i) => i.id === issueId);
}

// `useSettingsStore` and `api/client` import each other (the store resets the
// client when the URL changes). Requiring the store lazily here keeps this
// module out of that cycle — a static import can leave the store undefined
// depending on which module the bundler initialises first.
export function getVolumeCoverUrl(volumeId: number): string {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { shelvarrUrl } = require('../../stores/useSettingsStore').useSettingsStore.getState();
  return `${shelvarrUrl}/api/comics/${volumeId}/cover`;
}

export function getComicIssueFileUrl(issueId: number): string {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { shelvarrUrl } = require('../../stores/useSettingsStore').useSettingsStore.getState();
  return `${shelvarrUrl}/api/comics/issues/${issueId}/file`;
}

export interface ComicProgress {
  page: number;
  completed: boolean;
  total?: number;
}

export async function fetchComicProgress(issueId: number): Promise<ComicProgress | null> {
  try {
    const { data } = await getApiClient().get<ComicProgress | null>(
      `/api/comics/issues/${issueId}/progress`
    );
    return data ?? null;
  } catch {
    return null;
  }
}

export interface InProgressComic {
  volume: ComicVolumeSummary;
  issueId: number;
  issueNumber: string | null;
  page: number;
  total: number | null;
  updatedAt: string;
}

/** Volumes the user is partway through, most recently read first. */
export async function fetchInProgressComics(limit = 20): Promise<InProgressComic[]> {
  try {
    const { data } = await getApiClient().get<{ comics: InProgressComic[] }>(
      '/api/comics/in-progress',
      { params: { limit } }
    );
    return data?.comics ?? [];
  } catch {
    return [];
  }
}

export interface NextUpComic {
  volume: ComicVolumeSummary;
  issueId: number;
  issueNumber: string | null;
  updatedAt: string;
}

/** The next unread issue for volumes the user has partly finished. */
export async function fetchNextUpComics(limit = 20): Promise<NextUpComic[]> {
  try {
    const { data } = await getApiClient().get<{ comics: NextUpComic[] }>(
      '/api/comics/next-up',
      { params: { limit } }
    );
    return data?.comics ?? [];
  } catch {
    return [];
  }
}

export interface ComicIssueProgress {
  issueId: number;
  page: number;
  completed: boolean;
  total: number | null;
  updatedAt: string;
}

/** Per-issue read progress for a volume, keyed by issue id. */
export async function fetchVolumeProgress(volumeId: number): Promise<Map<number, ComicIssueProgress>> {
  try {
    const { data } = await getApiClient().get<{ progress: ComicIssueProgress[] }>(
      `/api/comics/${volumeId}/progress`
    );
    return new Map((data?.progress ?? []).map((p) => [p.issueId, p]));
  } catch {
    return new Map();
  }
}

export async function updateComicProgress(
  issueId: number,
  page: number,
  completed: boolean,
  total?: number
): Promise<void> {
  await getApiClient().patch(`/api/comics/issues/${issueId}/progress`, {
    page,
    completed,
    ...(total !== undefined ? { total } : {}),
  });
}
