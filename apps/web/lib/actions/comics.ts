'use server';

import { kapowarrClient, configureKapowarrFromDb } from '@/lib/services/kapowarr';
import type { KapowarrVolume, KapowarrIssue } from '@shelvarr/types';

export interface ComicsListResult {
  configured: boolean;
  volumes: KapowarrVolume[];
  error?: string;
}

export interface ComicDetailResult {
  configured: boolean;
  volume: (KapowarrVolume & { issues?: KapowarrIssue[] }) | null;
  coverUrl: string | null;
  error?: string;
}

export async function getComics(search?: string): Promise<ComicsListResult> {
  const configured = await configureKapowarrFromDb();
  if (!configured) {
    return { configured: false, volumes: [] };
  }

  try {
    const volumes = await kapowarrClient.getVolumes({ query: search });
    return { configured: true, volumes };
  } catch (error) {
    return {
      configured: true,
      volumes: [],
      error: error instanceof Error ? error.message : 'Failed to load comics',
    };
  }
}

export async function getComic(id: number): Promise<ComicDetailResult> {
  const configured = await configureKapowarrFromDb();
  if (!configured) {
    return { configured: false, volume: null, coverUrl: null };
  }

  try {
    const volume = await kapowarrClient.getVolume(id);
    return {
      configured: true,
      volume,
      coverUrl: `/api/comics/${id}/cover`,
    };
  } catch (error) {
    return {
      configured: true,
      volume: null,
      coverUrl: null,
      error: error instanceof Error ? error.message : 'Failed to load comic',
    };
  }
}

