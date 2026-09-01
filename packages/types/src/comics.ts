/**
 * Comic acquisition domain types.
 *
 * Derived from Kapowarr (GPL-3.0) — see NOTICE.md. The shapes mirror
 * `backend/base/definitions.py` (FilenameData, SearchResultData,
 * DownloadGroup, MatchedSearchResultData) with the naming adjusted to
 * Shelvarr's conventions.
 */

/**
 * A "special version" is a release that isn't a plain numbered issue.
 * Mirrors Kapowarr's `SpecialVersion` enum.
 */
export type SpecialVersion =
  | 'tpb'
  | 'one-shot'
  | 'hard-cover'
  | 'omnibus'
  | 'volume-as-issue'
  | 'cover'
  | 'metadata';

/**
 * An issue number is either a single number (`12`), a closed range
 * (`[1, 25]`), or absent.
 */
export type IssueNumber = number | [number, number] | null;

/** Data extracted from a filename, folder name, or search-result title. */
export interface FilenameData {
  /** The series name, cleaned of years/volume markers/issue numbers. */
  series: string;
  /** Release year, if one could be identified. */
  year: number | null;
  /** Volume number, or a range for multi-volume releases. */
  volumeNumber: number | [number, number] | null;
  specialVersion: SpecialVersion | null;
  issueNumber: IssueNumber;
  /** Whether the release is an annual. */
  annual: boolean;
}

/** Download hosts Shelvarr knows how to fetch from. */
export type DownloadHost =
  | 'getcomics'
  | 'pixeldrain'
  | 'datanodes'
  | 'vikingfile'
  | 'mega'
  | 'mediafire'
  | 'terabox';

/** One post in the GetComics WordPress index. */
export interface GetComicsPost {
  /** WordPress post id. */
  id: number;
  /** Post title, HTML entities already decoded. */
  title: string;
  /** Canonical article URL. */
  link: string;
  /** ISO-8601 publish date (site-local, as WordPress reports it). */
  date: string;
  /** The rendered article body, containing the download buttons. */
  contentHtml: string;
}

/** A search result: a post plus what its title says it contains. */
export interface ComicSearchResult extends FilenameData {
  postId: number;
  link: string;
  /** The raw post title, for display. */
  displayTitle: string;
  source: 'getcomics';
}

/** A search result annotated with whether it matches what we want. */
export interface MatchedComicSearchResult extends ComicSearchResult {
  match: boolean;
  /** Human-readable reason the result was rejected; null when `match`. */
  matchIssue: string | null;
}

/**
 * One downloadable chunk within an article — e.g. the "Batman #1-25" section
 * with its Pixeldrain/DataNodes/direct buttons.
 */
export interface DownloadGroup {
  /** The heading text of the section within the article. */
  subTitle: string;
  /** What the sub-title says this chunk contains. */
  info: FilenameData;
  /** Candidate links, keyed by host, in host-preference order. */
  links: Partial<Record<DownloadHost, string[]>>;
}

export type ComicDownloadState =
  | 'queued'
  | 'downloading'
  | 'importing'
  | 'completed'
  | 'failed'
  | 'cancelled';

/** A queued or in-flight download. */
export interface ComicDownload {
  id: number;
  volumeId: number;
  issueId: number | null;
  /** Issue(s) this download is expected to satisfy. */
  coveredIssues: IssueNumber;
  host: DownloadHost;
  downloadLink: string;
  /** The GetComics article the link came from. */
  webLink: string | null;
  webTitle: string | null;
  webSubTitle: string | null;
  /** Filename body the file will be renamed to on import. */
  filenameBody: string | null;
  /**
   * Other links on the article that cover the same issues, in host-preference
   * order, tried in turn if `downloadLink` dies before the file lands.
   */
  alternateLinks: ComicDownloadLink[];
  state: ComicDownloadState;
  /** Bytes downloaded so far. */
  progress: number;
  /** Total bytes, or null if the server didn't say. */
  size: number | null;
  /** How many times this download has been attempted. */
  attempts: number;
  error: string | null;
  /** Last sign of life, used to spot downloads orphaned by a restart. */
  heartbeatAt: string | null;
  createdAt: string;
  completedAt: string | null;
}

/** One candidate link for a download, with the host it came from. */
export interface ComicDownloadLink {
  host: DownloadHost;
  link: string;
}

/** Why a link was blocklisted. Mirrors Kapowarr's `BlocklistReason`. */
export type BlocklistReason =
  | 'link-broken'
  | 'source-not-supported'
  | 'no-working-links'
  | 'added-by-user';

export interface ComicBlocklistEntry {
  id: number;
  volumeId: number | null;
  issueId: number | null;
  webLink: string | null;
  webTitle: string | null;
  webSubTitle: string | null;
  downloadLink: string;
  host: DownloadHost | null;
  reason: BlocklistReason;
  addedAt: string;
}

// ---------------------------------------------------------------------------
// ComicVine metadata
//
// Shapes mirror Kapowarr's `VolumeMetadata` / `IssueMetadata`
// (`backend/base/definitions.py`), renamed to Shelvarr's conventions.
// ---------------------------------------------------------------------------

/** An issue as ComicVine describes it. */
export interface ComicIssueMetadata {
  comicvineId: number;
  /** ComicVine id of the volume it belongs to. */
  volumeComicvineId: number;
  /** As printed, e.g. `"1"`, `"3.5"`, `"½"`. */
  issueNumber: string;
  /** Sortable numeric form of `issueNumber`. */
  calculatedIssueNumber: number;
  title: string | null;
  /** ISO date (`YYYY-MM-DD`), from cover date or store date. */
  date: string | null;
  description: string;
}

/** A volume as ComicVine describes it. */
export interface ComicVolumeMetadata {
  comicvineId: number;
  title: string;
  year: number | null;
  volumeNumber: number;
  publisher: string | null;
  description: string;
  /** URL of the volume's cover thumbnail. */
  coverLink: string | null;
  siteUrl: string;
  aliases: string[];
  issueCount: number;
  /** Whether the description marks this as a translation. */
  translated: boolean;
  /** Populated by `fetchVolume`; null for search results and list fetches. */
  issues: ComicIssueMetadata[] | null;
}

/** A search hit, with a note on whether it's already in the library. */
export interface ComicVolumeSearchResult extends ComicVolumeMetadata {
  /** The local volume id when this is already in the library, else null. */
  alreadyAdded: number | null;
}

/** Which ComicVine date field to prefer for issue release dates. */
export type ComicVineDateType = 'cover_date' | 'store_date';

// ---------------------------------------------------------------------------
// Library ownership
// ---------------------------------------------------------------------------

/** A directory Shelvarr stores comics in. */
export interface ComicRootFolder {
  id: number;
  path: string;
  /** Bytes free on the filesystem, filled in on read; null if unreadable. */
  freeSpace?: number | null;
}

/** A file on disk belonging to a volume. */
export interface ComicFile {
  id: number;
  filepath: string;
  size: number;
}

/** How a file came to be linked to an issue. */
export type ComicFileLinkSource = 'scan' | 'manual';

/** A volume as Shelvarr stores it, once it owns the metadata. */
export interface ComicVolume {
  id: number;
  comicvineId: number;
  title: string;
  altTitle: string | null;
  year: number | null;
  volumeNumber: number;
  publisher: string | null;
  description: string;
  siteUrl: string | null;
  monitored: boolean;
  monitorNewIssues: boolean;
  rootFolderId: number | null;
  /** Absolute path to the volume's folder. */
  folder: string | null;
  /** True when the user set the folder by hand, so renames leave it alone. */
  customFolder: boolean;
  specialVersion: SpecialVersion | null;
  specialVersionLocked: boolean;
  /** Unix seconds of the last successful ComicVine refresh. */
  lastCvFetch: number;
}
