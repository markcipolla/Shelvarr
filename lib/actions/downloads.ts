'use server';

import { revalidatePath } from 'next/cache';
import {
  searchAllSources,
  searchSource,
  getSearchLinks,
  getSourceStatuses,
  refreshSourceStatuses,
  checkSourceHealth,
  type DownloadResult,
  type DownloadSource,
  type SourceStatus,
} from '@/lib/services/downloads';
import {
  getDownloadSourceConfigs,
  getDownloadSourceConfig,
  upsertDownloadSourceConfig,
  type DownloadSourceConfig,
} from '@/lib/db';
import { authenticateZLibrary } from '@/lib/services/downloads/zlibrary';

// Types are re-exported from the service layer for consumers
// Import types directly from '@/lib/services/downloads' or '@/lib/db' instead

/**
 * Search all download sources for a book
 */
export async function searchDownloads(
  query: string,
  options?: { isbn?: string; sources?: DownloadSource[] }
): Promise<{
  success: boolean;
  results?: DownloadResult[];
  error?: string;
}> {
  try {
    const results = await searchAllSources(query, options);
    return { success: true, results };
  } catch (error) {
    console.error('Error searching downloads:', error);
    return { success: false, error: 'Search failed' };
  }
}

/**
 * Search a specific download source
 */
export async function searchDownloadSource(
  source: DownloadSource,
  query: string,
  options?: { isbn?: string }
): Promise<{
  success: boolean;
  results?: DownloadResult[];
  error?: string;
}> {
  try {
    const results = await searchSource(source, query, options);
    return { success: true, results };
  } catch (error) {
    console.error(`Error searching ${source}:`, error);
    return { success: false, error: `Search on ${source} failed` };
  }
}

/**
 * Get search links for all sources (no API calls, instant)
 */
export async function getDownloadSearchLinks(query: string): Promise<{
  zlibrary: string;
  annas: string;
  libgen: string;
}> {
  return getSearchLinks(query);
}

/**
 * Get current source statuses (cached)
 */
export async function getDownloadSourceStatuses(forceRefresh = false): Promise<SourceStatus[]> {
  return getSourceStatuses(forceRefresh);
}

/**
 * Refresh source statuses from open-slum.org
 */
export async function refreshDownloadSourceStatuses(): Promise<{ success: boolean }> {
  try {
    await refreshSourceStatuses();
    revalidatePath('/wanted');
    revalidatePath('/settings');
    return { success: true };
  } catch (error) {
    console.error('Error refreshing source statuses:', error);
    return { success: false };
  }
}

/**
 * Check health of a specific source (direct check, not from cache)
 */
export async function checkDownloadSourceHealth(source: string): Promise<SourceStatus> {
  const status = await checkSourceHealth(source);
  revalidatePath('/settings');
  return status;
}

/**
 * Get download source configurations
 */
export async function getDownloadConfigs(): Promise<DownloadSourceConfig[]> {
  return getDownloadSourceConfigs();
}

/**
 * Get configuration for a specific source
 */
export async function getDownloadConfig(source: string): Promise<DownloadSourceConfig | null> {
  return getDownloadSourceConfig(source);
}

/**
 * Update download source configuration
 */
export async function updateDownloadConfig(
  source: string,
  enabled: boolean,
  credentials?: { email?: string; password?: string }
): Promise<{ success: boolean; error?: string }> {
  try {
    upsertDownloadSourceConfig(source, enabled, credentials);
    revalidatePath('/settings');
    return { success: true };
  } catch (error) {
    console.error('Error updating download config:', error);
    return { success: false, error: 'Failed to update configuration' };
  }
}

/**
 * Enable or disable a download source
 */
export async function toggleDownloadSource(
  source: string,
  enabled: boolean
): Promise<{ success: boolean; error?: string }> {
  try {
    const existing = getDownloadSourceConfig(source);
    const credentials = existing?.credentials ? JSON.parse(existing.credentials) : undefined;
    upsertDownloadSourceConfig(source, enabled, credentials);
    revalidatePath('/settings');
    return { success: true };
  } catch (error) {
    console.error('Error toggling download source:', error);
    return { success: false, error: 'Failed to toggle source' };
  }
}

/**
 * Save Z-Library credentials and authenticate
 */
export async function saveZLibraryCredentials(
  email: string,
  password: string
): Promise<{ success: boolean; error?: string }> {
  try {
    // Try to authenticate
    const authResult = await authenticateZLibrary(email, password);

    if (authResult) {
      // Save credentials with session tokens
      upsertDownloadSourceConfig('zlibrary', true, {
        email,
        password,
        remix_userid: authResult.remix_userid,
        remix_userkey: authResult.remix_userkey,
      });
      revalidatePath('/settings');
      return { success: true };
    }

    // Authentication failed, still save credentials but without tokens
    upsertDownloadSourceConfig('zlibrary', true, { email, password });
    revalidatePath('/settings');
    return { success: false, error: 'Authentication failed, credentials saved but downloads may not work' };
  } catch (error) {
    console.error('Error saving Z-Library credentials:', error);
    return { success: false, error: 'Failed to save credentials' };
  }
}

/**
 * Test connection to a download source
 */
export async function testDownloadSource(source: string): Promise<{
  success: boolean;
  status?: 'up' | 'down' | 'degraded';
  responseTime?: number;
  error?: string;
}> {
  try {
    const result = await checkSourceHealth(source);
    return {
      success: result.status === 'up' || result.status === 'degraded',
      status: result.status as 'up' | 'down' | 'degraded',
      responseTime: result.responseTime,
    };
  } catch (error) {
    console.error(`Error testing ${source}:`, error);
    return { success: false, error: `Failed to test ${source}` };
  }
}

/**
 * Clear Z-Library credentials
 */
export async function clearZLibraryCredentials(): Promise<{ success: boolean }> {
  try {
    upsertDownloadSourceConfig('zlibrary', true, undefined);
    revalidatePath('/settings');
    return { success: true };
  } catch (error) {
    console.error('Error clearing Z-Library credentials:', error);
    return { success: false };
  }
}
