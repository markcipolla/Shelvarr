/**
 * Source Status Service
 *
 * Fetches availability status from open-slum.org and caches it.
 */

import {
  getSourceStatusCache,
  updateSourceStatus,
  isStatusCacheStale,
} from '@/lib/db';

export interface SourceStatus {
  name: string;
  displayName: string;
  status: 'up' | 'down' | 'degraded' | 'unknown';
  responseTime?: number;
  lastChecked: Date;
  url: string;
}

// Known sources and their display names
const KNOWN_SOURCES: Record<string, { displayName: string; url: string }> = {
  zlibrary: { displayName: 'Z-Library', url: 'https://z-lib.gs' },
  annas: { displayName: "Anna's Archive", url: 'https://annas-archive.org' },
  libgen: { displayName: 'Library Genesis', url: 'https://libgen.is' },
  libgen_rs: { displayName: 'LibGen.rs', url: 'https://libgen.rs' },
  libgen_fiction: { displayName: 'LibGen Fiction', url: 'https://libgen.is/fiction' },
  sci_hub: { displayName: 'Sci-Hub', url: 'https://sci-hub.se' },
};

/**
 * Get all source statuses (from cache or fresh fetch)
 */
export async function getSourceStatuses(forceRefresh = false): Promise<SourceStatus[]> {
  // Check if cache is stale
  if (forceRefresh || isStatusCacheStale(5)) {
    await refreshSourceStatuses();
  }

  const cached = getSourceStatusCache();

  // Map cached data to SourceStatus format
  const statuses: SourceStatus[] = cached.map((c) => {
    const sourceInfo = KNOWN_SOURCES[c.source] || {
      displayName: c.source,
      url: '#',
    };

    return {
      name: c.source,
      displayName: sourceInfo.displayName,
      status: c.status,
      responseTime: c.response_time || undefined,
      lastChecked: new Date(c.last_updated),
      url: sourceInfo.url,
    };
  });

  // Add any known sources that aren't in cache
  for (const [name, info] of Object.entries(KNOWN_SOURCES)) {
    if (!statuses.find((s) => s.name === name)) {
      statuses.push({
        name,
        displayName: info.displayName,
        status: 'unknown',
        lastChecked: new Date(),
        url: info.url,
      });
    }
  }

  return statuses;
}

/**
 * Refresh source statuses from open-slum.org
 */
export async function refreshSourceStatuses(): Promise<void> {
  try {
    const response = await fetch('https://open-slum.org/', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'text/html,application/xhtml+xml',
      },
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      console.warn(`open-slum.org fetch failed: ${response.status}`);
      return;
    }

    const html = await response.text();

    // Parse status from the page
    // The page typically shows status indicators for various sources
    parseAndUpdateStatuses(html);
  } catch (error) {
    console.error('Failed to refresh source statuses:', error);

    // On error, set all sources to unknown
    for (const source of Object.keys(KNOWN_SOURCES)) {
      updateSourceStatus(source, 'unknown');
    }
  }
}

/**
 * Parse the open-slum.org HTML and update status cache
 */
function parseAndUpdateStatuses(html: string): void {
  // Map common names to our internal source names
  const nameMapping: Record<string, string> = {
    'z-library': 'zlibrary',
    'z-lib': 'zlibrary',
    'zlib': 'zlibrary',
    "anna's archive": 'annas',
    'annas archive': 'annas',
    'annas-archive': 'annas',
    'library genesis': 'libgen',
    'libgen': 'libgen',
    'libgen.is': 'libgen',
    'libgen.rs': 'libgen_rs',
    'sci-hub': 'sci_hub',
    'scihub': 'sci_hub',
  };

  // Pattern to match status entries from page structure
  const entryPattern = /<(?:div|li|tr)[^>]*class="[^"]*(?:site|service|source)[^"]*"[^>]*>[\s\S]*?<[^>]*class="[^"]*name[^"]*"[^>]*>([^<]+)<[\s\S]*?<[^>]*class="[^"]*status[^"]*"[^>]*>([^<]+)</gi;

  let match;
  const foundSources = new Set<string>();

  // Try to find status entries
  while ((match = entryPattern.exec(html)) !== null) {
    const [, rawName, rawStatus] = match;
    if (!rawName || !rawStatus) continue;
    const name = rawName.toLowerCase().trim();
    const status = rawStatus.toLowerCase().trim();

    const internalName = Object.entries(nameMapping).find(([key]) =>
      name.includes(key)
    )?.[1];

    if (internalName) {
      const parsedStatus = parseStatus(status);
      updateSourceStatus(internalName, parsedStatus);
      foundSources.add(internalName);
    }
  }

  // Fallback: try to parse by looking for keywords
  if (foundSources.size === 0) {
    for (const [keyword, internalName] of Object.entries(nameMapping)) {
      const keywordPattern = new RegExp(
        `${escapeRegex(keyword)}[^]*?(up|down|online|offline|operational|degraded|slow)`,
        'i'
      );
      const keywordMatch = html.match(keywordPattern);

      if (keywordMatch && keywordMatch[1]) {
        const status = parseStatus(keywordMatch[1]);
        updateSourceStatus(internalName, status);
        foundSources.add(internalName);
      }
    }
  }

  // For sources not found, mark as unknown
  for (const source of Object.keys(KNOWN_SOURCES)) {
    if (!foundSources.has(source)) {
      updateSourceStatus(source, 'unknown');
    }
  }
}

/**
 * Parse status text to our status type
 */
function parseStatus(statusText: string): 'up' | 'down' | 'degraded' {
  const text = statusText.toLowerCase();

  if (text.includes('up') || text.includes('online') || text.includes('operational')) {
    return 'up';
  }

  if (text.includes('down') || text.includes('offline') || text.includes('outage')) {
    return 'down';
  }

  if (text.includes('degraded') || text.includes('slow') || text.includes('issues')) {
    return 'degraded';
  }

  return 'up'; // Default to up if unclear
}

/**
 * Escape special regex characters
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Direct health check for a source (bypasses open-slum.org)
 */
export async function checkSourceHealth(source: string): Promise<SourceStatus> {
  const sourceInfo = KNOWN_SOURCES[source];
  if (!sourceInfo) {
    return {
      name: source,
      displayName: source,
      status: 'unknown',
      lastChecked: new Date(),
      url: '#',
    };
  }

  try {
    const start = Date.now();
    const response = await fetch(sourceInfo.url, {
      method: 'HEAD',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
      signal: AbortSignal.timeout(5000),
    });
    const responseTime = Date.now() - start;

    let status: 'up' | 'down' | 'degraded';
    if (response.ok) {
      status = responseTime > 3000 ? 'degraded' : 'up';
    } else {
      status = 'down';
    }

    updateSourceStatus(source, status, responseTime);

    return {
      name: source,
      displayName: sourceInfo.displayName,
      status,
      responseTime,
      lastChecked: new Date(),
      url: sourceInfo.url,
    };
  } catch {
    updateSourceStatus(source, 'down');

    return {
      name: source,
      displayName: sourceInfo.displayName,
      status: 'down',
      lastChecked: new Date(),
      url: sourceInfo.url,
    };
  }
}

export default {
  getSourceStatuses,
  refreshSourceStatuses,
  checkSourceHealth,
};
