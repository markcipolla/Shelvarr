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

// Komga settings
export async function getKomgaSettings() {
  return {
    url: await getSetting<string>('komga_url', null),
    username: await getSetting<string>('komga_username', null),
    hasPassword: !!(await getSetting<string>('komga_password', null)),
  };
}

export async function setKomgaSettings(url: string, username: string, password?: string) {
  setSetting('komga_url', url);
  setSetting('komga_username', username);
  if (password) {
    setSetting('komga_password', password);
  }

  revalidatePath('/settings');
  return { success: true };
}

export async function testKomgaConnection() {
  const url = await getSetting<string>('komga_url', null);
  const username = await getSetting<string>('komga_username', null);
  const password = await getSetting<string>('komga_password', null);

  if (!url || !username || !password) {
    return { success: false, error: 'Komga settings incomplete' };
  }

  try {
    const response = await fetch(`${url}/api/v1/libraries`, {
      headers: {
        Authorization: `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`,
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
