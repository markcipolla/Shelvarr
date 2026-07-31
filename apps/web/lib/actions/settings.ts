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

// Kapowarr settings
export async function getKapowarrSettings() {
  return {
    url: await getSetting<string>('kapowarr_url', null),
    hasApiKey: !!(await getSetting<string>('kapowarr_api_key', null)),
  };
}

export async function setKapowarrSettings(url: string, apiKey?: string) {
  setSetting('kapowarr_url', url);
  if (apiKey) {
    setSetting('kapowarr_api_key', apiKey);
  }

  const { configureKapowarrFromDb } = await import('@/lib/services/kapowarr');
  await configureKapowarrFromDb();

  revalidatePath('/settings');
  revalidatePath('/comics');
  return { success: true };
}

export async function testKapowarrConnection() {
  const url = await getSetting<string>('kapowarr_url', null);
  const apiKey = await getSetting<string>('kapowarr_api_key', null);

  if (!url || !apiKey) {
    return { success: false, error: 'Kapowarr settings incomplete' };
  }

  try {
    const base = url.replace(/\/$/, '');
    const response = await fetch(
      `${base}/api/system/about?api_key=${encodeURIComponent(apiKey)}`
    );

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

export async function isKapowarrConfigured(): Promise<boolean> {
  const url = await getSetting<string>('kapowarr_url', null);
  const apiKey = await getSetting<string>('kapowarr_api_key', null);
  return !!(url && apiKey);
}

// Audiletome settings (audiobook generation)
export async function getAudiletomeSettings() {
  return {
    url: await getSetting<string>('audiletome_url', null),
    hasApiKey: !!(await getSetting<string>('audiletome_api_key', null)),
  };
}

export async function setAudiletomeSettings(url: string, apiKey?: string) {
  setSetting('audiletome_url', url);
  if (apiKey) {
    setSetting('audiletome_api_key', apiKey);
  }

  const { configureAudiletomeFromDb } = await import('@/lib/services/audiletome');
  await configureAudiletomeFromDb();

  revalidatePath('/settings');
  return { success: true };
}

export async function testAudiletomeConnection() {
  const { configureAudiletomeFromDb, audiletomeClient } = await import('@/lib/services/audiletome');
  const configured = await configureAudiletomeFromDb();
  if (!configured) {
    return { success: false, error: 'Audiletome URL not configured' };
  }

  const result = await audiletomeClient.testConnection();
  if (result.connected) {
    const version = result.serverVersion ? ` (v${result.serverVersion})` : '';
    return { success: true, message: `Connected to ${result.serverName ?? 'audiletome'}${version}` };
  }
  return { success: false, error: result.error ?? 'Connection failed' };
}

export async function isAudiletomeConfigured(): Promise<boolean> {
  return !!(await getSetting<string>('audiletome_url', null));
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
