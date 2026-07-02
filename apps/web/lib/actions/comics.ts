'use server';

import { kapowarrClient, configureKapowarrFromDb } from '@/lib/services/kapowarr';
import {
  getInProgressComics as dbGetInProgressComics,
  getComicReadProgressForVolume as dbGetComicReadProgressForVolume,
  type InProgressComic,
  type ComicIssueProgress,
} from '@/lib/db';
import type { KapowarrVolume, KapowarrVolumeDetail } from '@shelvarr/types';

export interface ComicsListResult {
  configured: boolean;
  volumes: KapowarrVolume[];
  error?: string;
}

export interface ComicDetailResult {
  configured: boolean;
  volume: KapowarrVolumeDetail | null;
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

export async function getRecentComics(limit: number): Promise<ComicsListResult> {
  const configured = await configureKapowarrFromDb();
  if (!configured) {
    return { configured: false, volumes: [] };
  }

  try {
    const volumes = await kapowarrClient.getVolumes({ sort: 'recently_added' });
    return { configured: true, volumes: volumes.slice(0, limit) };
  } catch (error) {
    return {
      configured: true,
      volumes: [],
      error: error instanceof Error ? error.message : 'Failed to load comics',
    };
  }
}

/**
 * Volumes the user is partway through reading, most recent first. Sourced
 * from locally cached progress + volume metadata, so it works even when
 * Kapowarr is temporarily unreachable.
 */
export async function getInProgressComics(limit: number): Promise<InProgressComic[]> {
  return dbGetInProgressComics(limit);
}

/** Per-issue read progress for a volume, keyed by issue id. */
export async function getComicProgress(volumeId: number): Promise<ComicIssueProgress[]> {
  return dbGetComicReadProgressForVolume(volumeId);
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

