/**
 * Unified Download Search Service
 *
 * Searches all enabled sources and returns combined results.
 */

import { searchZLibrary, getZLibrarySearchUrl, type ZLibraryResult } from './zlibrary';
import { searchAnnas, getAnnasSearchUrl, type AnnasResult } from './annas';
import { searchLibGen, getLibGenSearchUrl, type LibGenResult } from './libgen';
import { getSourceStatuses } from './source-status';
import { SourceBlockedError, SourceParseError } from './challenge';
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

export interface BlockedSource {
  source: DownloadSource;
  message: string;
  // 'blocked' = the source answered with a bot-protection challenge page
  // (SourceBlockedError). 'parse-error' = it answered normally but the body
  // didn't match any recognisable results structure (SourceParseError) — a
  // sign the source's markup changed and its parser needs updating, not
  // that the search legitimately came back empty.
  reason: 'blocked' | 'parse-error';
}

export interface SearchAllSourcesResult {
  results: DownloadResult[];
  blockedSources: BlockedSource[];
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

// A result smaller than this is almost certainly a saved error page or a
// corrupt stub, not a book — no real epub/pdf/mobi is this small. Results
// with an unparseable/"Unknown" size are never dropped by this floor: we
// don't have enough information to reject them, and hiding a legitimate
// result because a source didn't report a size would be worse than
// occasionally showing a bad one.
export const MINIMUM_RESULT_SIZE_BYTES = 20 * 1024; // 20 KB

const SIZE_UNIT_MULTIPLIERS: Record<string, number> = {
  kb: 1024,
  mb: 1024 * 1024,
  gb: 1024 * 1024 * 1024,
};

/**
 * Parse a source's free-text size label (e.g. "2.5 MB", "850 KB", "1.2 GB")
 * into a byte count. Returns null for "Unknown" or anything else that
 * doesn't match a recognised unit — an unknown size is not the same as a
 * known-zero size, so callers must not treat null as 0.
 */
export function parseSizeToBytes(size: string): number | null {
  const trimmed = size.trim();
  if (!trimmed || trimmed.toLowerCase() === 'unknown') return null;

  const match = trimmed.match(/^(\d+(?:\.\d+)?)\s*(kb|mb|gb)$/i);
  if (!match) return null;

  const value = parseFloat(match[1]!);
  const multiplier = SIZE_UNIT_MULTIPLIERS[match[2]!.toLowerCase()];
  if (!Number.isFinite(value) || multiplier === undefined) return null;

  return Math.round(value * multiplier);
}

// Format preference, applied only as a sort tie-break (never a filter):
// epub > mobi/azw3 > pdf > everything else. Extensions not listed here
// (including the literal "unknown" some parsers fall back to) rank last.
const FORMAT_RANK: Record<string, number> = {
  epub: 0,
  mobi: 1,
  azw3: 1,
  pdf: 2,
};
const UNRANKED_FORMAT_RANK = 99;

function formatRank(extension: string): number {
  return FORMAT_RANK[extension.toLowerCase()] ?? UNRANKED_FORMAT_RANK;
}

/**
 * Search all enabled sources for a book
 */
export async function searchAllSources(
  query: string,
  options?: { isbn?: string; sources?: DownloadSource[]; language?: string }
): Promise<SearchAllSourcesResult> {
  const results: DownloadResult[] = [];
  const blockedSources: BlockedSource[] = [];
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
          if (err instanceof SourceBlockedError) {
            blockedSources.push({ source: 'zlibrary', message: err.message, reason: 'blocked' });
            return;
          }
          if (err instanceof SourceParseError) {
            blockedSources.push({ source: 'zlibrary', message: err.message, reason: 'parse-error' });
            return;
          }
          console.error('Z-Library search failed:', err);
        })
    );
  }

  if (sourcesToSearch.includes('annas') && isSourceEnabled('annas')) {
    searchPromises.push(
      searchAnnas(query, { language: options?.language })
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
          if (err instanceof SourceBlockedError) {
            blockedSources.push({ source: 'annas', message: err.message, reason: 'blocked' });
            return;
          }
          if (err instanceof SourceParseError) {
            blockedSources.push({ source: 'annas', message: err.message, reason: 'parse-error' });
            return;
          }
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
          if (err instanceof SourceBlockedError) {
            blockedSources.push({ source: 'libgen', message: err.message, reason: 'blocked' });
            return;
          }
          if (err instanceof SourceParseError) {
            blockedSources.push({ source: 'libgen', message: err.message, reason: 'parse-error' });
            return;
          }
          console.error('LibGen search failed:', err);
        })
    );
  }

  // Wait for all searches to complete
  await Promise.all(searchPromises);

  // Drop results whose parsed size is known and below the floor — a saved
  // HTML error page, not a book. Results with an unparseable/"Unknown" size
  // are kept: we don't have enough information to reject them.
  const filteredResults = results.filter((result) => {
    const bytes = parseSizeToBytes(result.size);
    return bytes === null || bytes >= MINIMUM_RESULT_SIZE_BYTES;
  });

  // Sort results: prefer sources that are 'up', then by relevance (title
  // match), then by format preference (epub > mobi/azw3 > pdf > other).
  filteredResults.sort((a, b) => {
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

    if (aMatch !== bMatch) {
      return aMatch - bMatch;
    }

    // Then by format preference (tie-break only — never filters results out)
    return formatRank(a.extension) - formatRank(b.extension);
  });

  return { results: filteredResults, blockedSources };
}

/**
 * Search a specific source
 */
export async function searchSource(
  source: DownloadSource,
  query: string,
  options?: { isbn?: string; language?: string }
): Promise<SearchAllSourcesResult> {
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
export { detectChallenge, SourceBlockedError, SourceParseError, getParserHealth } from './challenge';

export type { ZLibraryResult } from './zlibrary';
export type { AnnasResult } from './annas';
export type { LibGenResult } from './libgen';
export type { SourceStatus } from './source-status';
export type { ParserHealth } from './challenge';

export default {
  searchAllSources,
  searchSource,
  getSearchLinks,
};
