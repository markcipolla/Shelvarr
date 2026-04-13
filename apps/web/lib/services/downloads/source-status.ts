/**
 * Source Status Service
 *
 * Fetches availability status from open-slum.org API and caches it.
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

// Mapping of open-slum.org monitor IDs to our source names
// Check https://open-slum.org/ for current monitor IDs
const MONITOR_ID_MAP: Record<number, { source: string; displayName: string; url: string }> = {
  // Anna's Archive
  14: { source: 'annas_li', displayName: "Anna's Archive .li", url: 'https://annas-archive.li' },
  15: { source: 'annas', displayName: "Anna's Archive", url: 'https://annas-archive.org' },
  // Library Genesis+
  7: { source: 'libgen_vg', displayName: 'LibGen.vg', url: 'https://libgen.vg' },
  39: { source: 'libgen_la', displayName: 'LibGen.la', url: 'https://libgen.la' },
  40: { source: 'libgen_bz', displayName: 'LibGen.bz', url: 'https://libgen.bz' },
  41: { source: 'libgen_gl', displayName: 'LibGen.gl', url: 'https://libgen.gl' },
  // Z-Library
  36: { source: 'zlibrary', displayName: 'Z-Library', url: 'https://z-library.sk' },
  45: { source: 'zlib_gl', displayName: 'Z-Lib.gl', url: 'https://z-lib.gl' },
  // Others
  29: { source: 'liber3', displayName: 'Liber3', url: 'https://liber3.eth.limo' },
  38: { source: 'motw', displayName: 'Memory of the World', url: 'https://library.memoryoftheworld.org' },
};

// Known sources for display (subset we care about)
const KNOWN_SOURCES: Record<string, { displayName: string; url: string }> = {
  zlibrary: { displayName: 'Z-Library', url: 'https://z-library.sk' },
  annas: { displayName: "Anna's Archive", url: 'https://annas-archive.org' },
  annas_li: { displayName: "Anna's Archive .li", url: 'https://annas-archive.li' },
  libgen: { displayName: 'Library Genesis', url: 'https://libgen.vg' },
  libgen_vg: { displayName: 'Library Genesis', url: 'https://libgen.vg' },
};

interface HeartbeatEntry {
  status: number; // 0 = down, 1 = up, 2 = degraded
  time: string;
  msg: string;
  ping: number | null;
}

interface ApiResponse {
  heartbeatList: Record<string, HeartbeatEntry[]>;
  uptimeList: Record<string, number>;
}

/**
 * Get all source statuses (from cache or fresh fetch)
 */
export async function getSourceStatuses(forceRefresh = false): Promise<SourceStatus[]> {
  // Check if cache is stale (5 minutes)
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
 * Refresh source statuses from open-slum API (tries .org then .pages.dev as fallback)
 */
export async function refreshSourceStatuses(): Promise<void> {
  // Try both domains (primary and fallback)
  const apiUrls = [
    'https://open-slum.org/api/status-page/heartbeat/slum',
    'https://open-slum.pages.dev/api/status-page/heartbeat/slum',
  ];

  let data: ApiResponse | null = null;
  let lastError: Error | null = null;

  for (const url of apiUrls) {
    try {
      const response = await fetch(url, {
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'Shelvarr/1.0',
        },
        signal: AbortSignal.timeout(10000),
      });

      if (!response.ok) {
        console.warn(`API fetch from ${url} failed: ${response.status}`);
        continue;
      }

      data = await response.json();
      console.log(`Successfully fetched source statuses from ${url}`);
      break; // Success, exit loop
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      console.warn(`Failed to fetch from ${url}:`, error);
      // Continue to next URL
    }
  }

  if (!data) {
    console.error('Failed to refresh source statuses from all endpoints:', lastError);
    return;
  }

  try {
    // Process each monitor we care about
    for (const [idStr, monitorInfo] of Object.entries(MONITOR_ID_MAP)) {
      const id = parseInt(idStr);
      const heartbeats = data.heartbeatList[id];

      if (!heartbeats || heartbeats.length === 0) {
        updateSourceStatus(monitorInfo.source, 'unknown');
        continue;
      }

      // Get the most recent heartbeat
      const latest = heartbeats[heartbeats.length - 1];
      if (!latest) {
        updateSourceStatus(monitorInfo.source, 'unknown');
        continue;
      }

      // Map status: 0 = down, 1 = up, 2 = degraded
      let status: 'up' | 'down' | 'degraded';
      switch (latest.status) {
        case 1:
          status = 'up';
          break;
        case 2:
          status = 'degraded';
          break;
        case 0:
        default:
          status = 'down';
          break;
      }

      // Get response time from ping
      const responseTime = latest.ping ?? undefined;

      updateSourceStatus(monitorInfo.source, status, responseTime);
    }

    // For sources without direct monitoring, set to unknown
    for (const source of Object.keys(KNOWN_SOURCES)) {
      const hasMonitor = Object.values(MONITOR_ID_MAP).some(m => m.source === source);
      if (!hasMonitor) {
        // Check if we have a related source that's up
        // e.g., if zlibrary is monitored via ID 36, use that
      }
    }

  } catch (error) {
    console.error('Failed to process source statuses:', error);
    // On error, don't change existing cache - it's better than marking everything unknown
  }
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
