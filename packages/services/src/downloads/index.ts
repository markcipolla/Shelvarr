/**
 * Unified Download Search Service
 *
 * Searches all enabled sources and returns combined results.
 */

import { searchZLibrary, getZLibrarySearchUrl, type ZLibraryResult } from './zlibrary';
import { searchAnnas, getAnnasSearchUrl, type AnnasResult } from './annas';
import { searchLibGen, getLibGenSearchUrl, type LibGenResult } from './libgen';
import { getSourceStatuses } from './source-status';
import { isSourceEnabled, getDownloadSourceConfig } from '@shelvarr/db';

export type DownloadSource = 'zlibrary' | 'annas' | 'libgen';

export interface DownloadResult {
  id: string;
  source: DownloadSource;
  title: string;
  author: string;
  extension: string;
  size: string;
  year?: string;
  language?: string;
  downloadUrl?: string;
  searchUrl: string;
  sourceStatus?: 'up' | 'down' | 'degraded' | 'unknown';
  md5?: string; // LibGen uses MD5 for downloads
}

export interface SearchLinks {
  zlibrary: string;
  annas: string;
  libgen: string;
}

/**
 * Get quick search links for all sources (no API calls)
 */
export function getSearchLinks(query: string): SearchLinks {
  return {
    zlibrary: getZLibrarySearchUrl(query),
    annas: getAnnasSearchUrl(query),
    libgen: getLibGenSearchUrl(query),
  };
}

/**
 * Search all enabled sources for a book
 */
export async function searchAllSources(
  query: string,
  options?: { isbn?: string; sources?: DownloadSource[] }
): Promise<DownloadResult[]> {
  const results: DownloadResult[] = [];
  const sourcesToSearch = options?.sources || (['zlibrary', 'annas', 'libgen'] as DownloadSource[]);

  // Get current source statuses
  const statuses = await getSourceStatuses();
  const statusMap = new Map(statuses.map((s) => [s.name, s.status]));

  // Create search promises for enabled sources
  const searchPromises: Promise<void>[] = [];

  if (sourcesToSearch.includes('zlibrary') && isSourceEnabled('zlibrary')) {
    const zlibConfig = getDownloadSourceConfig('zlibrary');
    const credentials = zlibConfig?.credentials
      ? JSON.parse(zlibConfig.credentials)
      : undefined;

    searchPromises.push(
      searchZLibrary(query, credentials)
        .then((zlibResults: ZLibraryResult[]) => {
          for (const r of zlibResults) {
            results.push({
              id: `zlib-${r.id}`,
              source: 'zlibrary',
              title: r.title,
              author: r.author,
              extension: r.extension,
              size: r.size,
              year: r.year,
              language: r.language,
              downloadUrl: r.downloadUrl,
              searchUrl: r.searchUrl,
              sourceStatus: statusMap.get('zlibrary') as DownloadResult['sourceStatus'],
            });
          }
        })
        .catch((err) => {
          console.error('Z-Library search failed:', err);
        })
    );
  }

  if (sourcesToSearch.includes('annas') && isSourceEnabled('annas')) {
    searchPromises.push(
      searchAnnas(query)
        .then((annasResults: AnnasResult[]) => {
          for (const r of annasResults) {
            results.push({
              id: `annas-${r.id}`,
              source: 'annas',
              title: r.title,
              author: r.author,
              extension: r.extension,
              size: r.size,
              downloadUrl: r.downloadUrl,
              searchUrl: r.searchUrl,
              sourceStatus: statusMap.get('annas') as DownloadResult['sourceStatus'],
            });
          }
        })
        .catch((err) => {
          console.error("Anna's Archive search failed:", err);
        })
    );
  }

  if (sourcesToSearch.includes('libgen') && isSourceEnabled('libgen')) {
    searchPromises.push(
      searchLibGen(query, { isbn: options?.isbn })
        .then((libgenResults: LibGenResult[]) => {
          for (const r of libgenResults) {
            results.push({
              id: `libgen-${r.id}`,
              source: 'libgen',
              title: r.title,
              author: r.author,
              extension: r.extension,
              size: r.size,
              year: r.year,
              language: r.language,
              downloadUrl: r.downloadUrl,
              searchUrl: r.searchUrl,
              sourceStatus: statusMap.get('libgen') as DownloadResult['sourceStatus'],
              md5: r.md5, // Keep raw MD5 for downloads
            });
          }
        })
        .catch((err) => {
          console.error('LibGen search failed:', err);
        })
    );
  }

  // Wait for all searches to complete
  await Promise.all(searchPromises);

  // Sort results: prefer sources that are 'up', then by relevance (title match)
  results.sort((a, b) => {
    // Status priority: up > degraded > down > unknown
    const statusPriority = { up: 0, degraded: 1, down: 2, unknown: 3 };
    const aStatus = statusPriority[a.sourceStatus || 'unknown'];
    const bStatus = statusPriority[b.sourceStatus || 'unknown'];

    if (aStatus !== bStatus) {
      return aStatus - bStatus;
    }

    // Then by title containing the query
    const queryLower = query.toLowerCase();
    const aMatch = a.title.toLowerCase().includes(queryLower) ? 0 : 1;
    const bMatch = b.title.toLowerCase().includes(queryLower) ? 0 : 1;

    return aMatch - bMatch;
  });

  return results;
}

/**
 * Search a specific source
 */
export async function searchSource(
  source: DownloadSource,
  query: string,
  options?: { isbn?: string }
): Promise<DownloadResult[]> {
  return searchAllSources(query, {
    ...options,
    sources: [source],
  });
}

// Re-export individual source functions
export { searchZLibrary, getZLibrarySearchUrl } from './zlibrary';
export { searchAnnas, getAnnasSearchUrl, getAnnasDownloadLinks } from './annas';
export { searchLibGen, getLibGenSearchUrl, getLibGenDownloadUrl } from './libgen';
export { getSourceStatuses, refreshSourceStatuses, checkSourceHealth } from './source-status';

export type { ZLibraryResult } from './zlibrary';
export type { AnnasResult } from './annas';
export type { LibGenResult } from './libgen';
export type { SourceStatus } from './source-status';

export default {
  searchAllSources,
  searchSource,
  getSearchLinks,
};
