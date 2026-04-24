import { getApiClient } from './client';
import {
  getCachedComicDetail,
  getCachedComics,
  upsertComicDetail,
  upsertComicVolumes,
} from '../db/comics';
import type { KapowarrVolume, KapowarrVolumeDetail } from '@shelvarr/types';

export type { KapowarrVolume, KapowarrVolumeDetail };

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

export function getVolumeCoverUrl(volumeId: number): string {
  const { shelvarrUrl } = require('../../stores/useSettingsStore').useSettingsStore.getState();
  return `${shelvarrUrl}/api/comics/${volumeId}/cover`;
}
