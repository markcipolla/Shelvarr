import { getApiClient } from './client';
import {
  getCachedComicDetail,
  getCachedComics,
  upsertComicDetail,
  upsertComicVolumes,
} from '../db/comics';
import type { KapowarrVolume, KapowarrVolumeDetail, KapowarrIssue } from '@shelvarr/types';

export type { KapowarrVolume, KapowarrVolumeDetail, KapowarrIssue };

export interface ComicsListResponse {
  configured: boolean;
  volumes: KapowarrVolume[];
  cached?: boolean;
  error?: string;
}

export interface ComicDetailResponse {
  configured: boolean;
  volume?: KapowarrVolumeDetail;
  cached?: boolean;
  error?: string;
}

export interface ComicIssueResponse {
  configured: boolean;
  issue?: KapowarrIssue;
  cached?: boolean;
  error?: string;
}

export async function fetchComics(search?: string): Promise<ComicsListResponse> {
  const params: Record<string, string> = {};
  const trimmed = search?.trim();
  if (trimmed) params.search = trimmed;

  try {
    const { data } = await getApiClient().get<ComicsListResponse>('/api/comics', { params });
    if (data.configured && data.volumes.length > 0 && !trimmed) {
      await upsertComicVolumes(data.volumes);
    }
    return data;
  } catch (err) {
    const cached = await getCachedComics();
    if (cached.length > 0) {
      return {
        configured: true,
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
        configured: true,
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
    if (data.configured && data.volume && !data.cached) {
      await upsertComicDetail(data.volume);
    }
    return data;
  } catch (err) {
    const cached = await getCachedComicDetail(volumeId);
    if (cached) {
      return {
        configured: true,
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
    if (data.configured && data.issue) {
      return data;
    }
    if (data.error || !data.configured) {
      const cached = await cachedIssue(issueId, volumeId);
      if (cached) return { configured: true, issue: cached, cached: true, error: data.error };
    }
    return data;
  } catch (err) {
    const cached = await cachedIssue(issueId, volumeId);
    if (cached) {
      return {
        configured: true,
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
): Promise<KapowarrIssue | undefined> {
  if (volumeId === undefined) return undefined;
  const volume = await getCachedComicDetail(volumeId);
  return volume?.issues.find((i) => i.id === issueId);
}

export function getVolumeCoverUrl(volumeId: number): string {
  const { shelvarrUrl } = require('../../stores/useSettingsStore').useSettingsStore.getState();
  return `${shelvarrUrl}/api/comics/${volumeId}/cover`;
}

export function getComicIssueFileUrl(issueId: number): string {
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

export async function updateComicProgress(
  issueId: number,
  page: number,
  completed: boolean
): Promise<void> {
  await getApiClient().patch(`/api/comics/issues/${issueId}/progress`, { page, completed });
}
