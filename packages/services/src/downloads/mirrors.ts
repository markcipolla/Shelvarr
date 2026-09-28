/**
 * Mirror selection for the shadow-library sources.
 *
 * LibGen, Anna's Archive and Z-Library rotate domains — libgen.is -> .rs ->
 * .st -> .vg -> .la — and used to be hardcoded here in three separate
 * constants plus a fourth copy in `source-status.ts`. They live in the
 * `source_mirrors` table now, seeded from those same defaults and edited in
 * Settings -> Download Sources, so following a rotation is a setting change
 * rather than a release.
 *
 * Everything here reads the table on every call. That is deliberate: a
 * mirror added in Settings has to be usable by the very next search, with no
 * restart and no cache to invalidate. The reads are single indexed SQLite
 * queries against a handful of rows.
 */

import {
  DEFAULT_SOURCE_MIRRORS,
  getEnabledSourceMirrors,
  getSourceStatusCache,
} from '@shelvarr/db';

export type MirroredSource = 'libgen' | 'annas' | 'zlibrary';

/**
 * The key a mirror's health is cached under in `source_status_cache`.
 *
 * Derived from the mirror row rather than picked from a list of constants
 * (`libgen_vg`, `zlib_gl`, …), which is what let the two copies of the
 * domain list drift apart in the first place. A mirror someone adds at 11pm
 * gets probed, cached and ranked exactly like a shipped one.
 */
export function mirrorStatusKey(source: string, domain: string): string {
  return `${source}:${domain}`;
}

/** Inverse of `mirrorStatusKey`; null for anything that isn't a mirror key. */
export function parseMirrorStatusKey(
  key: string
): { source: string; domain: string } | null {
  const separator = key.indexOf(':');
  if (separator <= 0 || separator === key.length - 1) return null;
  return { source: key.slice(0, separator), domain: key.slice(separator + 1) };
}

/**
 * Every enabled mirror domain for a source, in the operator's preference
 * order (not health order — see `rankedMirrorDomains` for that).
 *
 * Falls back to the shipped defaults when the database can't be reached at
 * all, so a probe during startup or a unit test with no data directory still
 * gets a usable answer instead of an exception.
 */
export function configuredMirrorDomains(source: string): string[] {
  try {
    const domains = getEnabledSourceMirrors(source).map((mirror) => mirror.domain);
    if (domains.length > 0) return domains;
  } catch {
    // Database unavailable — fall through to the shipped defaults.
  }

  return DEFAULT_SOURCE_MIRRORS[source] ?? [];
}

type MirrorHealth = 'up' | 'degraded' | 'unknown' | 'down';

/** Last probed health for each of a source's configured mirrors. */
function mirrorHealth(source: string, domains: string[]): Map<string, MirrorHealth> {
  const health = new Map<string, MirrorHealth>(domains.map((domain) => [domain, 'unknown']));

  try {
    const statuses = getSourceStatusCache();
    for (const domain of domains) {
      const cached = statuses.find((s) => s.source === mirrorStatusKey(source, domain));
      if (cached) health.set(domain, cached.status);
    }
  } catch {
    // No status cache yet; everything stays 'unknown'.
  }

  return health;
}

const HEALTH_RANK: Record<MirrorHealth, number> = { up: 0, degraded: 1, unknown: 2, down: 3 };

/**
 * Every enabled mirror for a source, best-first: last probed as up, then
 * degraded, then unprobed, then known-down. Ties keep the configured
 * priority order. Callers that can fail over walk the whole list.
 */
export function rankedMirrorDomains(source: string): string[] {
  const domains = configuredMirrorDomains(source);
  const health = mirrorHealth(source, domains);

  return [...domains].sort(
    (a, b) => HEALTH_RANK[health.get(a) ?? 'unknown'] - HEALTH_RANK[health.get(b) ?? 'unknown']
  );
}

/**
 * The single mirror to use for a source that can't fail over mid-request
 * (Anna's Archive and Z-Library both build URLs from one domain).
 *
 * Preserves the behaviour the hardcoded lists had: the first mirror probed
 * as up, failing that the first probed as degraded, and failing that the
 * source's shipped fallback domain — which is not necessarily the
 * highest-priority one. The fallback is only honoured while it is still one
 * of the configured mirrors; once an operator removes it, their own
 * top-priority mirror takes over.
 */
export function preferredMirrorDomain(source: string, fallback: string): string {
  const domains = configuredMirrorDomains(source);
  if (domains.length === 0) return fallback;

  const health = mirrorHealth(source, domains);

  const up = domains.find((domain) => health.get(domain) === 'up');
  if (up) return up;

  const degraded = domains.find((domain) => health.get(domain) === 'degraded');
  if (degraded) return degraded;

  return domains.includes(fallback) ? fallback : domains[0]!;
}

/**
 * Whether any of a source's mirrors was last seen answering at all.
 *
 * `whenUnknown` is the answer for "we couldn't find out" — the status cache
 * is unreadable. Callers use it to stay fail-safe: not knowing whether a
 * source is up is not a reason to stop offering it.
 */
export function anyMirrorReachable(source: string, whenUnknown = false): boolean {
  let statuses;
  try {
    statuses = getSourceStatusCache();
  } catch {
    return whenUnknown;
  }

  return configuredMirrorDomains(source).some((domain) => {
    const status = statuses.find((s) => s.source === mirrorStatusKey(source, domain))?.status;
    return status === 'up' || status === 'degraded';
  });
}
