// Core domain types for Shelvarr

export interface Library {
  id: number;
  name: string;
  path: string;
  komgaLibraryId: string | null;
  createdAt: string;
}

export interface Book {
  id: number;
  libraryId: number;
  filePath: string;
  fileHash: string | null;
  fileSize: number | null;
  title: string | null;
  authors: string | null; // JSON array
  series: string | null;  // JSON array of [seriesName, position] tuples
  seriesName: string | null;  // Primary series name (for queries/display)
  seriesNumber: number | null;  // Primary series position
  isbn: string | null;
  publisher: string | null;
  publishDate: string | null;
  description: string | null;
  coverUrl: string | null;
  extension: string | null;
  komgaBookId: string | null;
  metadataSource: string | null;
  metadataId: string | null;
  createdAt: string;
  updatedAt: string;
  // Reading progress (optional — only populated by queries that join progress tables)
  progressPercent?: number | null; // 0-100, null if unknown
  progressCompleted?: boolean;
  // Hardcover.app reading status (optional — only populated by queries that join
  // the cached hardcover_reading_status table). null when the book is not tracked
  // on the user's Hardcover account.
  hardcoverStatus?: HardcoverReadingStatus | null;
}

// The user's reading status for a book on Hardcover.app.
export type HardcoverReadingStatus = 'want-to-read' | 'reading' | 'read' | 'dnf';

export interface Series {
  id: number;
  name: string;
  author: string | null;
  totalBooks: number | null;
  metadataSource: string | null;
  metadataId: string | null;
  createdAt: string;
}

export interface BookSeries {
  bookId: number;
  seriesId: number;
  position: number | null;
}

export interface Task {
  id: number;
  type: TaskType;
  status: TaskStatus;
  progress: number;
  total: number | null;
  result: string | null;
  error: string | null;
  createdAt: string;
  completedAt: string | null;
}

export type TaskType = 'scan' | 'metadata' | 'book_metadata' | 'organize' | 'download' | 'author_sync' | 'komga_sync';
export type TaskStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';

export interface Author {
  id: number;
  name: string;
  openlibraryId: string | null;
  googleBooksId: string | null;
  totalWorks: number | null;
  lastSynced: string | null;
  createdAt: string;
}

export interface AuthorWork {
  id: number;
  authorId: number;
  title: string;
  isbn: string | null;
  publishYear: number | null;
  language: string | null;
  metadataSource: string | null;
  metadataId: string | null;
  owned: boolean;
  bookId: number | null;
  wanted: boolean;
  createdAt: string;
}

export interface Download {
  id: number;
  title: string;
  author: string | null;
  isbn: string | null;
  source: DownloadSource;
  sourceUrl: string | null;
  status: DownloadStatus;
  targetLibraryId: number | null;
  filePath: string | null;
  error: string | null;
  createdAt: string;
  completedAt: string | null;
}

export type DownloadSource = 'zlibrary' | 'annas' | 'libgen';
export type DownloadStatus = 'pending' | 'downloading' | 'completed' | 'failed';

// API response types
export interface ApiResponse<T> {
  data?: T;
  error?: string;
  message?: string;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface HealthResponse {
  status: 'ok' | 'error';
  version: string;
  timestamp: string;
}

// Config types
export interface KomgaConfig {
  url: string | null;
  apiKey: string | null;
}

/**
 * Settings that only matter while migrating a library Shelvarr did not
 * organise itself.
 */
export interface ComicMigrationConfig {
  /**
   * `"from:to"` prefix remap for paths recorded by whatever managed the
   * library before. Kapowarr, for instance, reports its own container paths;
   * this maps them onto the ones Shelvarr can see. Unused once volumes are
   * managed, because their folders are then Shelvarr's own.
   */
  pathMap: string | null;
}

/** Where comics are sourced from and what happens to the files. */
export interface GetComicsConfig {
  /** Site base URL — configurable so a mirror can be swapped in. */
  baseUrl: string;
  /** Scratch directory for in-flight downloads. */
  downloadDir: string;
  /** Root of the comic library; downloads are imported into it. */
  libraryRoot: string | null;
  /** Order to try download hosts in. */
  hostPreference: string[];
  /** Rename imported files to the configured naming template. */
  renameDownloadedFiles: boolean;
}

export interface AudiletomeConfig {
  /** Base URL of an audiletome server, e.g. http://localhost:10000 */
  url: string | null;
  /** Sent as the `X-Api-Key` header; null keeps the API open (trusted network). */
  apiKey: string | null;
}

export interface AppConfig {
  env: string;
  port: number;
  dataDir: string;
  libraryRoot: string;
  dbPath: string;
  komga: KomgaConfig;
  comicMigration: ComicMigrationConfig;
  getcomics: GetComicsConfig;
  audiletome: AudiletomeConfig;
  supportedExtensions: string[];
  rateLimits: {
    hardcover: number;
  };
  hardcoverToken: string | null;
}

// The comic wire format.
//
// These shapes originally mirrored Kapowarr's Flask API, and the snake_case
// field names are a legacy of that. They are kept because the native app and
// its on-device cache speak them; renaming the fields would strand cached
// data on every installed client for no benefit.

/** A file belonging to a volume, as the API reports it. */
export interface ComicFileRef {
  id: number;
  filepath: string;
  size: number;
}

/** A volume file that isn't an issue: cover art, ComicInfo.xml, and so on. */
export interface ComicGeneralFile extends ComicFileRef {
  file_type: string;
}

/** A volume as the library list reports it. */
export interface ComicVolumeSummary {
  id: number;
  comicvine_id: number;
  title: string;
  year: number | null;
  publisher: string | null;
  volume_number: number;
  description: string;
  monitored: boolean;
  monitor_new_issues: boolean;
  folder: string;
  issue_count: number;
  issue_count_monitored: number;
  issues_downloaded: number;
  issues_downloaded_monitored: number;
  total_size: number | null;
}

/** A volume with its issues and files. */
export interface ComicVolumeDetail extends ComicVolumeSummary {
  special_version: string | null;
  special_version_locked: boolean;
  site_url: string;
  root_folder: number;
  volume_folder: string;
  issues: ComicIssueSummary[];
  general_files: ComicGeneralFile[];
}

/** An issue with the files that satisfy it. */
export interface ComicIssueSummary {
  id: number;
  volume_id: number;
  comicvine_id: number;
  issue_number: string;
  calculated_issue_number: number;
  title: string | null;
  date: string | null;
  description: string;
  monitored: boolean;
  files: ComicFileRef[];
}

// Settings stored in database
export interface Settings {
  [key: string]: unknown;
  _config?: {
    libraryRoot: string;
    supportedExtensions: string[];
    komgaConfigured: boolean;
    komgaUrl?: string | null;
  };
}

// File organization types
export interface OrganizePreview {
  bookId: number;
  currentPath: string;
  newPath: string;
  action: 'move' | 'rename' | 'skip';
  reason?: string;
}

export interface DuplicateGroup {
  hash: string;
  books: Book[];
  similarity: number;
}

// Database-specific types
export interface WantedBook {
  id: number;
  hardcover_id: string | null;
  title: string;
  author: string | null;
  isbn: string | null;
  cover_url: string | null;
  description: string | null;
  added_at: string;
  priority: number;
  notes: string | null;
  status: 'wanted' | 'searching' | 'found' | 'acquired';
}

export interface DownloadSourceConfig {
  id: number;
  source: string;
  enabled: number;
  credentials: string | null;
  last_checked: string | null;
}

export interface SourceStatusCache {
  id: number;
  source: string;
  status: 'up' | 'down' | 'degraded' | 'unknown';
  response_time: number | null;
  last_updated: string;
}

// Read progress types (for Komga-compatible API)
export interface ReadProgress {
  id: number;
  bookId: number;
  page: number;
  completed: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ComicReadProgress {
  id: number;
  issueId: number;
  page: number;
  completed: boolean;
  total: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface EpubProgression {
  id: number;
  bookId: number;
  deviceId: string;
  locator: string; // JSON - EPUB CFI/position
  progression: number; // 0-1 percentage
  createdAt: string;
  updatedAt: string;
}

// Audiletome domain types — mirror the read-only, versioned /api/v1 integration
// API an audiletome server exposes (server/src/audiletome/shelvarr_api.py).

/** Coarse, stable state callers can switch on, distinct from the raw status string. */
export type AudiletomeState = 'pending' | 'processing' | 'completed' | 'failed';

export interface AudiletomeProgress {
  total: number;
  done: number;
  failed: number;
  leased: number;
  pending: number;
  percent: number;
}

export interface AudiletomeBook {
  id: number;
  title?: string;
  /** Raw upstream status string. */
  status: string;
  /** Coarse state derived from `status`. */
  state: AudiletomeState;
  progress: AudiletomeProgress;
  /** Present once the .m4b is ready. */
  download_url: string | null;
}

export interface AudiletomeSystemStatus {
  /** App name reported by the server. */
  name: string;
  version: string;
  /** Liveness indicator, e.g. "ok". */
  status: string;
}
