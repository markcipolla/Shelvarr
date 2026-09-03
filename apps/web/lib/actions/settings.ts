'use server';

import { revalidatePath } from 'next/cache';
import { getSetting, setSetting, getAllSettings } from '@/lib/db';
import { getAllSourcesStatus, isConfigured } from '@/lib/services/metadata';

// Only Hardcover is supported
type MetadataSource = 'hardcover';

export async function getSettings() {
  return getAllSettings();
}

export async function getSourcesStatus() {
  return getAllSourcesStatus();
}

export async function toggleSource(source: MetadataSource, enabled: boolean) {
  const currentSettings = await getSetting<Record<string, { enabled: boolean }>>(
    'metadata_sources',
    {}
  ) || {};

  currentSettings[source] = { enabled };
  setSetting('metadata_sources', currentSettings);

  revalidatePath('/settings');
  return { success: true };
}

export async function setApiKey(source: MetadataSource, apiKey: string) {
  const key = `${source}_api_key`;
  setSetting(key, apiKey);

  revalidatePath('/settings');
  return { success: true };
}

export async function getApiKey(source: MetadataSource): Promise<string | null> {
  const key = `${source}_api_key`;
  return getSetting<string>(key, null);
}

export async function testSourceConnection(source: MetadataSource) {
  if (source !== 'hardcover') {
    return { success: false, error: 'Unknown source' };
  }

  if (!isConfigured()) {
    return { success: false, error: 'Hardcover API key not configured' };
  }

  // TODO: Add actual connection test for Hardcover
  return { success: true };
}

/**
 * Check if Hardcover API is configured
 */
export async function isHardcoverConfigured(): Promise<boolean> {
  return isConfigured();
}

/**
 * Pull the user's Hardcover reading statuses (want to read / reading / read)
 * into the local cache so they surface on book cards and the home rows.
 */
export async function syncHardcoverStatus(): Promise<{
  success: boolean;
  synced?: number;
  error?: string;
}> {
  const { hardcover } = await import('@/lib/services/metadata');
  const result = await hardcover.syncReadingStatusesFromHardcover();
  if (result.success) {
    revalidatePath('/');
    revalidatePath('/books');
    revalidatePath('/settings');
  }
  return result;
}

// Komga settings
export async function getKomgaSettings() {
  return {
    url: await getSetting<string>('komga_url', null),
    hasApiKey: !!(await getSetting<string>('komga_api_key', null)),
  };
}

export async function setKomgaSettings(url: string, apiKey?: string) {
  setSetting('komga_url', url);
  if (apiKey) {
    setSetting('komga_api_key', apiKey);
  }

  revalidatePath('/settings');
  return { success: true };
}

export async function testKomgaConnection() {
  const url = await getSetting<string>('komga_url', null);
  const apiKey = await getSetting<string>('komga_api_key', null);

  if (!url || !apiKey) {
    return { success: false, error: 'Komga settings incomplete' };
  }

  try {
    const response = await fetch(`${url}/api/v1/libraries`, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    });

    if (response.ok) {
      return { success: true };
    } else {
      return { success: false, error: `HTTP ${response.status}` };
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Connection failed',
    };
  }
}

// Organize settings
import { DEFAULT_ORGANIZE_TEMPLATE, previewReorganization } from '@/lib/services/organizer';
import type { ReorgPreviewItem } from '@/lib/services/organizer';

export async function getOrganizeSettings(): Promise<{ template: string; autoRun: boolean }> {
  const template = await getSetting<string>('organize_template', DEFAULT_ORGANIZE_TEMPLATE);
  const autoRun = await getSetting<boolean>('organize_auto_run', true);
  return {
    template: template ?? DEFAULT_ORGANIZE_TEMPLATE,
    autoRun: autoRun ?? true,
  };
}

function validateTemplate(template: string): string | null {
  if (!template || template.trim().length === 0) {
    return 'Template cannot be empty';
  }
  const normalized = template
    .replace(/\{\{(\w+)\}\}/g, '{$1}')
    .replace(/\{series_name\}/g, '{series}')
    .replace(/\{series_number\}/g, '{number}')
    .replace(/\{extension\}/g, '{ext}');

  if (!/\{title\}/.test(normalized)) {
    return 'Template must contain {title}';
  }
  if (!/\{ext\}/.test(normalized) && !/\.[a-z0-9]+$/i.test(template.trim())) {
    return 'Template must contain {ext} or end with a literal extension';
  }
  if (template.startsWith('/')) {
    return 'Template must not start with /';
  }
  if (template.includes('..')) {
    return 'Template must not contain ..';
  }
  return null;
}

export async function setOrganizeSettings(
  template: string,
  autoRun: boolean,
): Promise<{ success: true } | { error: string }> {
  const error = validateTemplate(template);
  if (error) return { error };

  setSetting('organize_template', template);
  setSetting('organize_auto_run', autoRun);

  revalidatePath('/settings');
  revalidatePath('/settings/organize');
  return { success: true };
}

export async function previewOrganizeForLibrary(
  libraryId: number,
): Promise<ReorgPreviewItem[]> {
  const { template } = await getOrganizeSettings();
  return previewReorganization(libraryId, { template });
}

// ---------------------------------------------------------------------------
// Comics: ComicVine metadata and library root folders
// ---------------------------------------------------------------------------

export async function getComicsSettings() {
  const { comicLibrary } = await import('@shelvarr/services');
  const { countVolumesInRootFolder } = await import('@/lib/db');

  return {
    hasApiKey: !!(await getSetting<string>('comicvine_api_key', null)),
    dateType: (await getSetting<string>('comicvine_date_type', 'cover_date')) ?? 'cover_date',
    rootFolders: comicLibrary.listRootFolders().map((folder) => ({
      ...folder,
      volumeCount: countVolumesInRootFolder(folder.id),
    })),
  };
}

export async function setComicVineSettings(apiKey?: string, dateType?: string) {
  if (apiKey) setSetting('comicvine_api_key', apiKey);
  if (dateType) setSetting('comicvine_date_type', dateType);

  revalidatePath('/settings');
  revalidatePath('/comics');
  return { success: true };
}

/** Verify the stored ComicVine key with the cheapest call the API allows. */
export async function testComicVineConnection() {
  const { comicLibrary } = await import('@shelvarr/services');

  try {
    const client = await comicLibrary.getComicVine();
    return (await client.testKey())
      ? { success: true }
      : { success: false, error: 'ComicVine rejected the API key' };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Connection failed',
    };
  }
}

export async function addComicRootFolderAction(path: string) {
  const { comicLibrary } = await import('@shelvarr/services');

  try {
    await comicLibrary.addRootFolder(path);
    revalidatePath('/settings');
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to add root folder',
    };
  }
}

export async function removeComicRootFolderAction(id: number) {
  const { comicLibrary } = await import('@shelvarr/services');

  try {
    comicLibrary.removeRootFolder(id);
    revalidatePath('/settings');
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to remove root folder',
    };
  }
}

/**
 * Kick off a library import scan. Returns the task id so the UI can follow it
 * on the tasks page — it makes one ComicVine search per folder, so a large
 * library takes minutes.
 */
export async function startComicLibraryImport(path: string) {
  const { queue } = await import('@shelvarr/services');
  const task = queue.enqueueTask('comic_library_import', { path });
  revalidatePath('/settings');
  return { success: true, taskId: task.id };
}

// ---------------------------------------------------------------------------
// Recurring jobs
// ---------------------------------------------------------------------------

export interface ScheduleView {
  name: string;
  description: string;
  intervalSeconds: number;
  nextRun: number;
  lastRun: number | null;
  enabled: boolean;
}

export async function getSchedules(): Promise<ScheduleView[]> {
  const { scheduler } = await import('@shelvarr/services');

  scheduler.ensureDefaultSchedules();
  return scheduler.listSchedules().map((schedule) => ({
    name: schedule.name,
    description: schedule.description,
    intervalSeconds: schedule.intervalSeconds,
    nextRun: schedule.nextRun,
    lastRun: schedule.lastRun,
    enabled: schedule.enabled,
  }));
}

export async function setScheduleEnabledAction(name: string, enabled: boolean) {
  const { scheduler } = await import('@shelvarr/services');

  try {
    scheduler.setScheduleEnabled(name, enabled);
    revalidatePath('/settings/comics');
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to update schedule',
    };
  }
}

export async function setScheduleIntervalAction(name: string, intervalSeconds: number) {
  const { scheduler } = await import('@shelvarr/services');

  try {
    scheduler.setScheduleInterval(name, intervalSeconds);
    revalidatePath('/settings/comics');
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to update interval',
    };
  }
}

/** Run a scheduled job now, leaving its timetable alone. */
export async function runScheduleNowAction(name: string) {
  const { scheduler } = await import('@shelvarr/services');

  try {
    const taskId = scheduler.runScheduleNow(name);
    revalidatePath('/settings/comics');
    return { success: true, taskId };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to run job',
    };
  }
}

// ---------------------------------------------------------------------------
// Migrating a mirrored library
// ---------------------------------------------------------------------------

export interface AdoptionCandidateView {
  volumeId: number;
  title: string;
  localFolder: string | null;
  issueCount: number;
  blocker: string | null;
}

/**
 * Volumes still mirrored from a previous manager, and what stands in the way
 * of taking each one over.
 */
export async function getAdoptionCandidates(): Promise<AdoptionCandidateView[]> {
  const { comicAdopt } = await import('@shelvarr/services');

  return comicAdopt.listAdoptionCandidates().map((candidate) => ({
    volumeId: candidate.volumeId,
    title: candidate.title,
    localFolder: candidate.localFolder,
    issueCount: candidate.issueCount,
    blocker: candidate.blocker,
  }));
}

/**
 * Take over every mirrored volume that is ready.
 *
 * Runs in the background: adoption itself is cheap, but each volume's folder
 * gets scanned, and a large library takes a moment.
 */
export async function startComicAdoption(volumeIds?: number[]) {
  const { comicAdopt, queue } = await import('@shelvarr/services');

  const ready = comicAdopt
    .listAdoptionCandidates()
    .filter((candidate) => !candidate.blocker);
  if (ready.length === 0) {
    return { success: false as const, error: 'Nothing is ready to migrate' };
  }

  const task = queue.enqueueTask('comic_adopt', {
    ...(volumeIds && volumeIds.length > 0 ? { volumeIds } : {}),
  });

  revalidatePath('/settings/comics');
  revalidatePath('/comics');
  return { success: true as const, taskId: task.id, count: volumeIds?.length ?? ready.length };
}
