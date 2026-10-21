/**
 * GetComics acquisition: search for a volume's missing issues, pick working
 * links, and queue them for download.
 *
 * This is the module that touches the database; everything it composes
 * (`parse`, `match`, `rank`, `groups`, `paths`, `clients`) is free of I/O
 * beyond HTTP, so the hard logic stays testable in isolation.
 *
 * Derived from Kapowarr (GPL-3.0) — see NOTICE.md.
 */

import { existsSync } from 'fs';

import {
  addToComicBlocklist,
  comicBlocklistContains,
  completedComicDownloadFile,
  getComicVolumeForMatching,
  isComicDownloadActive,
  isSourceEnabled,
} from '@shelvarr/db';
import { addDownload } from '../download-events';
import type {
  ComicDownload,
  ComicDownloadLink,
  DownloadGroup,
  DownloadHost,
  GetComicsPost,
  MatchedComicSearchResult,
  SpecialVersion,
} from '@shelvarr/types';

import { getServiceConfig } from '../../config';
import { createLogger } from '../../utils/logger';
import { generateIssueName } from '../naming';
import { LinkBrokenError, isResolvable, resolveDownload } from './clients';
import { DEFAULT_HOST_PREFERENCE, extractDownloadGroups } from './groups';
import type { VolumeIssueData, VolumeMatchData } from './match';
import { createLinkPaths } from './paths';
import {
  autoSearch,
  fetchPosts,
  manualSearch,
  type GetComicsOptions,
} from './search';

const log = createLogger('getcomics');

export * from './parse';
export * from './match';
export * from './rank';
export * from './groups';
export * from './paths';
export * from './search';
export * from './clients';
export * from './normalise';

/** Read search options out of app config, so callers don't have to. */
function searchOptions(signal?: AbortSignal): GetComicsOptions {
  const { getcomics } = getServiceConfig();
  return { baseUrl: getcomics.baseUrl, ...(signal ? { signal } : {}) };
}

/**
 * GetComics is a download source like the ebook ones, so it honours the same
 * on/off switch in Settings -> Download sources. Absent config means
 * disabled: nothing is fetched until it has been asked for.
 */
export function isGetComicsEnabled(): boolean {
  return isSourceEnabled('getcomics');
}

/**
 * What every refusal says when the switch is off. Shared because the switch is
 * checked from the queue handlers, the API routes and the server actions as
 * well as from here, and four different wordings for one cause is three too
 * many.
 */
export const GETCOMICS_DISABLED_MESSAGE =
  'GetComics is disabled. Turn it on in Settings \u2192 Download sources.';

function assertGetComicsEnabled(): void {
  if (!isGetComicsEnabled()) {
    throw new Error(GETCOMICS_DISABLED_MESSAGE);
  }
}

function hostPreference(): DownloadHost[] {
  const configured = getServiceConfig().getcomics.hostPreference as DownloadHost[];
  return configured.length > 0 ? configured : DEFAULT_HOST_PREFERENCE;
}

interface LoadedVolume {
  id: number;
  volume: VolumeMatchData;
  issues: VolumeIssueData[];
  monitored: boolean;
  folder: string | null;
  /** Year of the last issue, used to widen year matching. */
  endingYear: number | null;
}

/** Load a volume and its issues in the shape the matcher expects. */
export function loadVolume(volumeId: number): LoadedVolume | null {
  const data = getComicVolumeForMatching(volumeId);
  if (!data) return null;

  const years = data.issues
    .map((issue) => issue.year)
    .filter((year): year is number => year !== null);

  return {
    id: data.volume.id,
    volume: {
      title: data.volume.title,
      altTitle: data.volume.altTitle,
      year: data.volume.year,
      volumeNumber: data.volume.volumeNumber,
      specialVersion: (data.volume.specialVersion as SpecialVersion | null) ?? null,
    },
    issues: data.issues,
    monitored: data.volume.monitored,
    folder: data.volume.folder,
    endingYear: years.length > 0 ? Math.max(...years) : data.volume.year,
  };
}

export interface SearchVolumeOptions {
  /** Search for one issue instead of the whole volume. */
  issueId?: number | null;
  /** Search this instead of the query built from catalogue metadata. */
  query?: string | null;
  signal?: AbortSignal;
}

export interface SearchVolumeResult {
  results: MatchedComicSearchResult[];
  posts: Map<string, GetComicsPost>;
  /** What was actually asked of GetComics. */
  queries: string[];
}

/**
 * Manual search: every result GetComics returns for a volume, ranked, with a
 * reason attached to the ones that don't match.
 */
export async function searchVolume(
  volumeId: number,
  options: SearchVolumeOptions = {}
): Promise<SearchVolumeResult> {
  assertGetComicsEnabled();

  const loaded = loadVolume(volumeId);
  if (!loaded) throw new Error(`Comic volume ${volumeId} not found`);

  const issue = options.issueId
    ? loaded.issues.find((candidate) => candidate.id === options.issueId)
    : undefined;
  if (options.issueId && !issue) {
    throw new Error(`Issue ${options.issueId} is not part of volume ${volumeId}`);
  }

  log.info('Manual search', {
    volumeId,
    issueId: options.issueId ?? null,
    query: options.query ?? null,
  });

  return manualSearch(
    {
      volume: loaded.volume,
      issues: loaded.issues,
      issue: issue
        ? {
            issueNumber: String(issue.calculatedIssueNumber),
            calculatedIssueNumber: issue.calculatedIssueNumber,
          }
        : null,
      isBlocklisted: comicBlocklistContains,
      query: options.query ?? null,
    },
    searchOptions(options.signal)
  );
}

/** A link that resolved successfully, ready to be queued. */
interface WorkingLink {
  host: DownloadHost;
  link: string;
  group: DownloadGroup;
  /**
   * The group's remaining candidates, in host-preference order. They are not
   * probed — that would cost a request each for links most downloads never
   * need — but they are recorded so the download can fall back if this one
   * dies before the file lands.
   */
  alternates: ComicDownloadLink[];
}

/**
 * Every host GetComics offered on this group, with a count per host — so the
 * ones `isResolvable` throws away are still visible to the log rather than
 * silently vanishing before we can measure how often that costs us.
 */
function countHostsOffered(group: DownloadGroup): Partial<Record<DownloadHost, number>> {
  const counts: Partial<Record<DownloadHost, number>> = {};
  for (const [host, links] of Object.entries(group.links) as Array<[DownloadHost, string[]]>) {
    counts[host] = links.length;
  }
  return counts;
}

interface LinkSearchResult {
  working: WorkingLink | null;
  /**
   * A link failed for a reason that is not the link's fault — a rate limit, a
   * timeout, the host briefly unreachable.
   *
   * This travels back to the caller because finding nothing is not evidence
   * of anything when the site was refusing to talk to us. Blocklisting on it
   * is permanent, and the article is usually fine an hour later.
   */
  transient: boolean;
}

/**
 * Try each link in a group, in host-preference order, until one resolves.
 * Dead links are blocklisted so later searches skip them.
 */
async function findWorkingLink(
  group: DownloadGroup,
  context: { volumeId: number; issueId: number | null; webLink: string; webTitle: string | null },
  signal?: AbortSignal
): Promise<LinkSearchResult> {
  const hostsOffered = countHostsOffered(group);
  const resolvable = (Object.keys(hostsOffered) as DownloadHost[]).filter(isResolvable);

  const candidates: ComicDownloadLink[] = [];
  for (const [host, links] of Object.entries(group.links) as Array<[DownloadHost, string[]]>) {
    if (!isResolvable(host)) continue;
    for (const link of links) candidates.push({ host, link });
  }

  let working: WorkingLink | null = null;
  let transient = false;

  for (const [index, { host, link }] of candidates.entries()) {
    if (comicBlocklistContains(link)) continue;

    try {
      await resolveDownload(host, link, signal);
      const alternates = candidates
        .slice(index + 1)
        .filter((candidate) => !comicBlocklistContains(candidate.link));
      working = { host, link, group, alternates };
      break;
    } catch (error) {
      if (error instanceof LinkBrokenError) {
        log.info('Blocklisting broken link', { link, reason: error.message });
        addToComicBlocklist({
          downloadLink: link,
          reason: 'link-broken',
          volumeId: context.volumeId,
          issueId: context.issueId,
          webLink: context.webLink,
          webTitle: context.webTitle,
          webSubTitle: group.subTitle,
          host,
        });
        continue;
      }
      // Rate limits and transient failures shouldn't poison the link.
      transient = true;
      log.warn('Link resolution failed', { link, error });
    }
  }

  log.info('Host coverage', {
    hostsOffered,
    resolvable,
    chosen: working?.host ?? null,
    transient,
  });

  return { working, transient };
}

export interface CreateDownloadsOptions {
  volumeId: number;
  post: GetComicsPost;
  /** Attribute the downloads to a specific issue. */
  issueId?: number | null;
  /** Take everything on the page, skipping the match filter. */
  forceMatch?: boolean;
  signal?: AbortSignal;
}

/**
 * Turn a GetComics article into queued downloads for a volume.
 *
 * Walks the article's candidate paths in order of how much they cover and
 * takes the first whose links actually work — so a page offering both a
 * complete TPB and separate issue ranges prefers the TPB, but falls back to
 * the ranges if the TPB's mirrors are dead.
 */
export async function createDownloadsFromPost(
  options: CreateDownloadsOptions
): Promise<ComicDownload[]> {
  assertGetComicsEnabled();

  const { volumeId, post, issueId = null, forceMatch = false, signal } = options;

  const loaded = loadVolume(volumeId);
  if (!loaded) throw new Error(`Comic volume ${volumeId} not found`);

  const groups = extractDownloadGroups(post.contentHtml, hostPreference());
  if (groups.length === 0) {
    throw new Error(`No download links found on ${post.link}`);
  }

  const paths = createLinkPaths({
    groups,
    volume: loaded.volume,
    issues: loaded.issues,
    endingYear: loaded.endingYear,
    forceMatch,
  });
  if (paths.length === 0) {
    throw new Error(`Nothing on ${post.link} matches volume ${volumeId}`);
  }

  const context = {
    volumeId,
    issueId,
    webLink: post.link,
    webTitle: post.title,
  };

  let transient = false;

  for (const path of paths) {
    const working: WorkingLink[] = [];
    for (const group of path) {
      const found = await findWorkingLink(group, context, signal);
      if (found.transient) transient = true;
      if (found.working) working.push(found.working);
    }
    if (working.length === 0) continue;

    // Don't spend the bandwidth twice. A link that already brought back a
    // file still on disk is not worth fetching again whatever the library
    // thinks of what it got — and when it got nothing out of it, as a release
    // with no issue number in its name does, "the issue is still missing" is
    // exactly the state that sends us back here.
    const queueable: WorkingLink[] = [];
    const onDisk: string[] = [];
    for (const entry of working) {
      if (isComicDownloadActive(entry.link)) continue;
      const existing = existingCopy(entry);
      if (existing !== null) {
        onDisk.push(existing);
        continue;
      }
      queueable.push(entry);
    }

    if (queueable.length === 0 && onDisk.length > 0) {
      throw new Error(
        `Already downloaded from ${post.link}: ${onDisk[0]} is on disk. Delete it ` +
          'first if you want another copy.'
      );
    }

    return queueable.map((entry) => {
      const resolvedIssueId = resolveIssueId(loaded, entry.group, issueId);
      return addDownload({
        volumeId,
        issueId: resolvedIssueId,
        coveredIssues: entry.group.info.issueNumber,
        host: entry.host,
        downloadLink: entry.link,
        alternateLinks: entry.alternates,
        webLink: post.link,
        webTitle: post.title,
        webSubTitle: entry.group.subTitle,
        filenameBody: buildFilenameBody(loaded, entry.group, resolvedIssueId),
      });
    });
  }

  // Nothing resolved, but a rate limit or an unreachable host is not evidence
  // that the article is dead — and blocklisting it is permanent. Sweeping a
  // large library is exactly what provokes GetComics into rate-limiting, so
  // treating that as "dead" let one busy night blocklist articles whose links
  // still serve the file perfectly well. Leave it for the next sweep.
  if (transient) {
    throw new Error(
      `Could not reach any download link on ${post.link} — not blocklisting it, ` +
        'since the host was rate-limiting or unreachable rather than the links being dead'
    );
  }

  // Every link actually proved broken. Record that so the same article isn't
  // retried endlessly by auto-search.
  addToComicBlocklist({
    downloadLink: post.link,
    reason: 'no-working-links',
    volumeId,
    issueId,
    webLink: post.link,
    webTitle: post.title,
  });
  throw new Error(`No working download links on ${post.link}`);
}

/**
 * A copy of this group's file already on disk, from an earlier download.
 *
 * Every link in the group is one mirror of the same file, so a copy fetched
 * from any of them counts — the host that wins the preference order today
 * need not be the one that won last time.
 */
function existingCopy(entry: WorkingLink): string | null {
  for (const link of [entry.link, ...entry.alternates.map((alternate) => alternate.link)]) {
    const path = completedComicDownloadFile(link);
    if (path !== null && existsSync(path)) return path;
  }
  return null;
}

/**
 * Which issue a group is for, when it covers exactly one. Ranges and special
 * versions stay unattributed — they satisfy several issues at once.
 */
function resolveIssueId(
  loaded: LoadedVolume,
  group: DownloadGroup,
  fallback: number | null
): number | null {
  const number = group.info.issueNumber;
  if (typeof number !== 'number') return fallback;
  const issue = loaded.issues.find(
    (candidate) => candidate.calculatedIssueNumber === number
  );
  return issue?.id ?? fallback;
}

/**
 * The issue number to put in the filename when the release's own title had
 * none of its own.
 *
 * A series collected as books — "Birdking Vol. 2 (2023)" — names no issue
 * anywhere, so every release in it was named `Birdking (2022) Volume 01`:
 * the second landed beside the first as `… (2)`, and the scan, which reads
 * the issue back out of the filename, filed both under issue one while
 * issues two and three stayed missing. The queue knew which issue it
 * fetched; only the name threw it away.
 *
 * Not for volumes that are a single book. There the number is noise, and
 * `Ancestor (2016) Volume 01` is the name we want.
 */
function fallbackIssueNumber(loaded: LoadedVolume, issueId: number | null): number | null {
  if (issueId === null || loaded.issues.length <= 1) return null;
  return loaded.issues.find((issue) => issue.id === issueId)?.calculatedIssueNumber ?? null;
}

function buildFilenameBody(
  loaded: LoadedVolume,
  group: DownloadGroup,
  issueId: number | null
): string | null {
  if (!getServiceConfig().getcomics.renameDownloadedFiles) return null;
  return generateIssueName(
    {
      title: loaded.volume.title,
      year: loaded.volume.year,
      volumeNumber: loaded.volume.volumeNumber,
      specialVersion: loaded.volume.specialVersion,
    },
    group.info.issueNumber ?? fallbackIssueNumber(loaded, issueId)
  );
}

export interface AutoSearchVolumeOptions {
  issueId?: number | null;
  signal?: AbortSignal;
}

export interface AutoSearchVolumeResult {
  /** Downloads that were queued. */
  downloads: ComicDownload[];
  /** Releases that were chosen but whose links all turned out to be dead. */
  failed: Array<{ link: string; error: string }>;
  /** How many releases GetComics returned at all. */
  found: number;
  /** How many of those were for this volume. */
  matched: number;
  /** The queries sent; empty when nothing was wanted so nothing was asked. */
  queries: string[];
}

/**
 * Search for a volume's missing issues and queue the best combination of
 * releases found. This is what the "search" button and the scheduled sweep
 * both call.
 */
export async function autoSearchVolume(
  volumeId: number,
  options: AutoSearchVolumeOptions = {}
): Promise<AutoSearchVolumeResult> {
  // Not a silent no-op. Returning an empty result here is indistinguishable
  // from "GetComics has nothing for this volume", so the one setting that
  // stops every download was invisible to the only people who could change
  // it: the search button said "queued", the task completed, and no comic
  // ever arrived. The scheduled sweep checks the switch itself, so nothing is
  // left retrying on a timer.
  assertGetComicsEnabled();

  const loaded = loadVolume(volumeId);
  if (!loaded) throw new Error(`Comic volume ${volumeId} not found`);

  const issue = options.issueId
    ? loaded.issues.find((candidate) => candidate.id === options.issueId)
    : undefined;
  if (options.issueId && !issue) {
    throw new Error(`Issue ${options.issueId} is not part of volume ${volumeId}`);
  }

  log.info('Auto search', {
    volumeId,
    issueId: options.issueId ?? null,
    title: loaded.volume.title,
  });

  const { chosen, posts, results, queries } = await autoSearch(
    {
      volume: loaded.volume,
      issues: loaded.issues,
      issue: issue
        ? {
            issueNumber: String(issue.calculatedIssueNumber),
            calculatedIssueNumber: issue.calculatedIssueNumber,
          }
        : null,
      monitored: loaded.monitored,
      isBlocklisted: comicBlocklistContains,
    },
    searchOptions(options.signal)
  );

  const downloads: ComicDownload[] = [];
  const failed: AutoSearchVolumeResult['failed'] = [];

  for (const result of chosen) {
    const post = posts.get(result.link);
    if (!post) continue;

    try {
      const created = await createDownloadsFromPost({
        volumeId,
        post,
        issueId: options.issueId ?? null,
        ...(options.signal ? { signal: options.signal } : {}),
      });
      downloads.push(...created);
    } catch (error) {
      failed.push({
        link: result.link,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const matched = results.filter((result) => result.match).length;

  log.info('Auto search finished', {
    volumeId,
    queued: downloads.length,
    failed: failed.length,
    found: results.length,
    matched,
    queries,
  });

  return { downloads, failed, found: results.length, matched, queries };
}

/**
 * Free-text search, for the case where you know the article you want and just
 * need Shelvarr to grab it.
 */
export async function searchPosts(
  query: string,
  signal?: AbortSignal
): Promise<GetComicsPost[]> {
  assertGetComicsEnabled();

  return fetchPosts(query, searchOptions(signal));
}
