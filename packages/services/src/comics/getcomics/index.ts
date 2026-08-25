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

import {
  addComicDownload,
  addToComicBlocklist,
  comicBlocklistContains,
  getComicVolumeForMatching,
  isComicDownloadActive,
} from '@shelvarr/db';
import type {
  ComicDownload,
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
  signal?: AbortSignal;
}

export interface SearchVolumeResult {
  results: MatchedComicSearchResult[];
  posts: Map<string, GetComicsPost>;
}

/**
 * Manual search: every result GetComics returns for a volume, ranked, with a
 * reason attached to the ones that don't match.
 */
export async function searchVolume(
  volumeId: number,
  options: SearchVolumeOptions = {}
): Promise<SearchVolumeResult> {
  const loaded = loadVolume(volumeId);
  if (!loaded) throw new Error(`Comic volume ${volumeId} not found`);

  const issue = options.issueId
    ? loaded.issues.find((candidate) => candidate.id === options.issueId)
    : undefined;
  if (options.issueId && !issue) {
    throw new Error(`Issue ${options.issueId} is not part of volume ${volumeId}`);
  }

  log.info('Manual search', { volumeId, issueId: options.issueId ?? null });

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
    },
    searchOptions(options.signal)
  );
}

/** A link that resolved successfully, ready to be queued. */
interface WorkingLink {
  host: DownloadHost;
  link: string;
  group: DownloadGroup;
}

/**
 * Try each link in a group, in host-preference order, until one resolves.
 * Dead links are blocklisted so later searches skip them.
 */
async function findWorkingLink(
  group: DownloadGroup,
  context: { volumeId: number; issueId: number | null; webLink: string; webTitle: string | null },
  signal?: AbortSignal
): Promise<WorkingLink | null> {
  for (const [host, links] of Object.entries(group.links) as Array<[DownloadHost, string[]]>) {
    if (!isResolvable(host)) continue;

    for (const link of links) {
      if (comicBlocklistContains(link)) continue;

      try {
        await resolveDownload(host, link, signal);
        return { host, link, group };
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
        log.warn('Link resolution failed', { link, error });
      }
    }
  }

  return null;
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

  for (const path of paths) {
    const working: WorkingLink[] = [];
    for (const group of path) {
      const found = await findWorkingLink(group, context, signal);
      if (found) working.push(found);
    }
    if (working.length === 0) continue;

    return working
      .filter((entry) => !isComicDownloadActive(entry.link))
      .map((entry) =>
        addComicDownload({
          volumeId,
          issueId: resolveIssueId(loaded, entry.group, issueId),
          coveredIssues: entry.group.info.issueNumber,
          host: entry.host,
          downloadLink: entry.link,
          webLink: post.link,
          webTitle: post.title,
          webSubTitle: entry.group.subTitle,
          filenameBody: buildFilenameBody(loaded, entry.group),
        })
      );
  }

  // Every path was dead. Record that so the same article isn't retried
  // endlessly by auto-search.
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

function buildFilenameBody(loaded: LoadedVolume, group: DownloadGroup): string | null {
  if (!getServiceConfig().getcomics.renameDownloadedFiles) return null;
  return generateIssueName(
    {
      title: loaded.volume.title,
      year: loaded.volume.year,
      volumeNumber: loaded.volume.volumeNumber,
      specialVersion: loaded.volume.specialVersion,
    },
    group.info.issueNumber
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

  const { chosen, posts } = await autoSearch(
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

  log.info('Auto search finished', {
    volumeId,
    queued: downloads.length,
    failed: failed.length,
  });

  return { downloads, failed };
}

/**
 * Free-text search, for the case where you know the article you want and just
 * need Shelvarr to grab it.
 */
export async function searchPosts(
  query: string,
  signal?: AbortSignal
): Promise<GetComicsPost[]> {
  return fetchPosts(query, searchOptions(signal));
}
