import { getApiClient } from './client';
import type { KapowarrVolume, KapowarrVolumeDetail } from '@shelvarr/types';

export type { KapowarrVolume, KapowarrVolumeDetail };

export interface ComicsListResponse {
  configured: boolean;
  volumes: KapowarrVolume[];
  error?: string;
}

export interface ComicDetailResponse {
  configured: boolean;
  volume?: KapowarrVolumeDetail;
  error?: string;
}

export async function fetchComics(search?: string): Promise<ComicsListResponse> {
  const params: Record<string, string> = {};
  if (search && search.trim()) params.search = search.trim();
  const { data } = await getApiClient().get<ComicsListResponse>('/api/comics', { params });
  return data;
}

export async function fetchComicDetail(volumeId: number): Promise<ComicDetailResponse> {
  const { data } = await getApiClient().get<ComicDetailResponse>(`/api/comics/${volumeId}`);
  return data;
}

export function getVolumeCoverUrl(volumeId: number): string {
  const { shelvarrUrl } = require('../../stores/useSettingsStore').useSettingsStore.getState();
  return `${shelvarrUrl}/api/comics/${volumeId}/cover`;
}
