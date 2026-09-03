/**
 * Source Status Service
 *
 * Probes each source's domain directly and caches the result.
 *
 * This used to read open-slum.org's Uptime Kuma API. That API is gone — the
 * site is now a statically rendered page with no JSON endpoint — so every
 * refresh 404'd and left the cache empty, which in turn made mirror selection
 * fall back to a hardcoded domain.
 */

import {
  getSourceStatusCache,
  updateSourceStatus,
  isStatusCacheStale,
} from '@shelvarr/db';

import { getServiceConfig } from '../config';

export interface SourceStatus {
  name: string;
  displayName: string;
  status: 'up' | 'down' | 'degraded' | 'unknown';
  responseTime?: number;
  lastChecked: Date;
  url: string;
}

interface KnownSource {
  displayName: string;
  url: string;
  /** Endpoint to probe in `checkSourceHealth`, when the landing page won't do. */
  healthUrl?: string;
  /** Some hosts don't answer HEAD; default is HEAD. */
  healthMethod?: 'HEAD' | 'GET';
  /**
   * Sources whose statuses roll up into this one. An aggregate is not probed
   * itself — it reports the best status among its mirrors.
   */
  mirrors?: string[];
}

// Sources shown in the UI
const KNOWN_SOURCES: Record<string, KnownSource> = {
  zlibrary: { displayName: 'Z-Library', url: 'https://z-library.sk' },
  annas: { displayName: "Anna's Archive", url: 'https://annas-archive.org' },
  annas_li: { displayName: "Anna's Archive .li", url: 'https://annas-archive.li' },
  libgen: {
    displayName: 'Library Genesis',
    url: 'https://libgen.vg',
    mirrors: ['libgen_vg', 'libgen_la', 'libgen_bz', 'libgen_gl'],
  },
  getcomics: { displayName: 'GetComics', url: 'https://getcomics.org' },
};

// Individual mirrors. Probed so the download code can pick a working domain,
// but they aren't surfaced as headline sources.
const MIRROR_SOURCES: Record<string, KnownSource> = {
  libgen_vg: { displayName: 'LibGen.vg', url: 'https://libgen.vg' },
  libgen_la: { displayName: 'LibGen.la', url: 'https://libgen.la' },
  libgen_bz: { displayName: 'LibGen.bz', url: 'https://libgen.bz' },
  libgen_gl: { displayName: 'LibGen.gl', url: 'https://libgen.gl' },
  zlib_gl: { displayName: 'Z-Lib.gl', url: 'https://z-lib.gl' },
};

/**
 * Look up a source, with the GetComics URLs taken from config so a configured
 * mirror is what gets linked and probed.
 */
function knownSource(source: string): KnownSource | undefined {
  const info = KNOWN_SOURCES[source] || MIRROR_SOURCES[source];
  if (!info) return undefined;
  if (source !== 'getcomics') return info;

  const baseUrl = getServiceConfig().getcomics.baseUrl.replace(/\/$/, '');
  return {
    ...info,
    url: baseUrl,
    // GetComics is WordPress; the REST API answers reliably where the landing
    // page sits behind caching and doesn't always accept HEAD.
    healthUrl: `${baseUrl}/wp-json/wp/v2/posts?per_page=1&_fields=id`,
    healthMethod: 'GET',
  };
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
    const sourceInfo = knownSource(c.source) || {
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
  for (const name of Object.keys(KNOWN_SOURCES)) {
    const info = knownSource(name)!;
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
 * Probe one source's domain. Bot-protection responses (403/429/503) mean the
 * host is alive but gate-keeping, which is 'degraded' rather than 'down'.
 */
async function probeSource(info: KnownSource): Promise<{
  status: 'up' | 'down' | 'degraded';
  responseTime: number;
}> {
  const start = Date.now();

  try {
    const response = await fetch(info.healthUrl || info.url, {
      method: info.healthMethod || 'HEAD',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
      signal: AbortSignal.timeout(5000),
    });
    const responseTime = Date.now() - start;

    if (response.ok) {
      return { status: responseTime > 3000 ? 'degraded' : 'up', responseTime };
    }
    if ([401, 403, 429, 503].includes(response.status)) {
      return { status: 'degraded', responseTime };
    }
    return { status: 'down', responseTime };
  } catch {
    return { status: 'down', responseTime: Date.now() - start };
  }
}

/**
 * Refresh source statuses by probing every source and mirror in parallel
 */
export async function refreshSourceStatuses(): Promise<void> {
  const toProbe = [
    ...Object.keys(KNOWN_SOURCES).filter((name) => !KNOWN_SOURCES[name]!.mirrors),
    ...Object.keys(MIRROR_SOURCES),
  ];

  const results = new Map<string, 'up' | 'down' | 'degraded'>();

  await Promise.all(
    toProbe.map(async (name) => {
      const info = knownSource(name);
      if (!info) return;

      const { status, responseTime } = await probeSource(info);
      results.set(name, status);

      try {
        updateSourceStatus(name, status, responseTime);
      } catch (error) {
        console.error(`Failed to cache status for ${name}:`, error);
      }
    })
  );

  // Roll mirrors up into their aggregate source (e.g. libgen_* -> libgen)
  const rank: Record<string, number> = { up: 0, degraded: 1, down: 2 };

  for (const [name, info] of Object.entries(KNOWN_SOURCES)) {
    if (!info.mirrors) continue;

    const mirrorStatuses = info.mirrors
      .map((mirror) => results.get(mirror))
      .filter((s): s is 'up' | 'down' | 'degraded' => s !== undefined);

    if (mirrorStatuses.length === 0) continue;

    const best = mirrorStatuses.reduce((a, b) => (rank[a]! <= rank[b]! ? a : b));

    try {
      updateSourceStatus(name, best);
    } catch (error) {
      console.error(`Failed to cache status for ${name}:`, error);
    }
  }
}

/**
 * Direct health check for a single source
 */
export async function checkSourceHealth(source: string): Promise<SourceStatus> {
  const sourceInfo = knownSource(source);
  if (!sourceInfo) {
    return {
      name: source,
      displayName: source,
      status: 'unknown',
      lastChecked: new Date(),
      url: '#',
    };
  }

  // An aggregate has no endpoint of its own; probe its mirrors and roll up.
  if (sourceInfo.mirrors) {
    const rank: Record<string, number> = { up: 0, degraded: 1, down: 2 };
    let best: 'up' | 'down' | 'degraded' = 'down';
    let bestTime: number | undefined;

    for (const mirror of sourceInfo.mirrors) {
      const info = knownSource(mirror);
      if (!info) continue;

      const { status, responseTime } = await probeSource(info);
      updateSourceStatus(mirror, status, responseTime);

      if (rank[status]! < rank[best]!) {
        best = status;
        bestTime = responseTime;
      }
    }

    updateSourceStatus(source, best, bestTime);

    return {
      name: source,
      displayName: sourceInfo.displayName,
      status: best,
      responseTime: bestTime,
      lastChecked: new Date(),
      url: sourceInfo.url,
    };
  }

  const { status, responseTime } = await probeSource(sourceInfo);
  updateSourceStatus(source, status, responseTime);

  return {
    name: source,
    displayName: sourceInfo.displayName,
    status,
    responseTime,
    lastChecked: new Date(),
    url: sourceInfo.url,
  };
}

export default {
  getSourceStatuses,
  refreshSourceStatuses,
  checkSourceHealth,
};
