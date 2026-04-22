import { getApiClient } from './client';
import type { KapowarrVolume } from '@shelvarr/types';

export type { KapowarrVolume };

export interface ComicsListResponse {
  configured: boolean;
  volumes: KapowarrVolume[];
  error?: string;
}

export async function fetchComics(search?: string): Promise<ComicsListResponse> {
  const params: Record<string, string> = {};
  if (search && search.trim()) params.search = search.trim();
  const { data } = await getApiClient().get<ComicsListResponse>('/api/comics', { params });
  return data;
}

export function getVolumeCoverUrl(volumeId: number): string {
  const { shelvarrUrl } = require('../../stores/useSettingsStore').useSettingsStore.getState();
  return `${shelvarrUrl}/api/comics/${volumeId}/cover`;
}
