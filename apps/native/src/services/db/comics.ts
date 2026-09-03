/**
 * Offline cache for comic metadata.
 * Reads/writes go through the local expo-sqlite database so the app
 * can render detail pages and lists without a server connection.
 */
import type {
  ComicVolumeSummary,
  ComicVolumeDetail,
  ComicIssueSummary,
  ComicFileRef,
  ComicGeneralFile,
} from '@shelvarr/types';
import { getDatabase } from './database';

interface ComicRow {
  id: number;
  comicvine_id: number | null;
  slug: string | null;
  title: string;
  year: number | null;
  publisher: string | null;
  volume_number: number | null;
  description: string | null;
  monitored: number;
  monitor_new_issues: number;
  folder: string | null;
  issue_count: number | null;
  issue_count_monitored: number | null;
  issues_downloaded: number | null;
  issues_downloaded_monitored: number | null;
  total_size: number | null;
  special_version: string | null;
  special_version_locked: number | null;
  site_url: string | null;
  root_folder: number | null;
  volume_folder: string | null;
  general_files: string | null;
  cached_at: string;
  updated_at: string;
  detail_cached_at: string | null;
  deleted_at: string | null;
}

interface IssueRow {
  id: number;
  volume_id: number;
  comicvine_id: number | null;
  issue_number: string | null;
  calculated_issue_number: number | null;
  title: string | null;
  date: string | null;
  description: string | null;
  monitored: number;
  files: string | null;
  cached_at: string;
  updated_at: string;
  deleted_at: string | null;
}

function parseJson<T>(text: string | null, fallback: T): T {
  if (!text) return fallback;
  try {
    return JSON.parse(text) as T;
  } catch {
    return fallback;
  }
}

function rowToVolume(row: ComicRow): ComicVolumeSummary {
  return {
    id: row.id,
    // Caches written before the server sent slugs have none; the id is what
    // the web app falls back to as well.
    slug: row.slug || String(row.id),
    comicvine_id: row.comicvine_id ?? 0,
    title: row.title,
    year: row.year,
    publisher: row.publisher,
    volume_number: row.volume_number ?? 0,
    description: row.description ?? '',
    monitored: Boolean(row.monitored),
    monitor_new_issues: Boolean(row.monitor_new_issues),
    folder: row.folder ?? '',
    issue_count: row.issue_count ?? 0,
    issue_count_monitored: row.issue_count_monitored ?? 0,
    issues_downloaded: row.issues_downloaded ?? 0,
    issues_downloaded_monitored: row.issues_downloaded_monitored ?? 0,
    total_size: row.total_size,
  };
}

function rowToIssue(row: IssueRow): ComicIssueSummary {
  return {
    id: row.id,
    volume_id: row.volume_id,
    comicvine_id: row.comicvine_id ?? 0,
    issue_number: row.issue_number ?? '',
    calculated_issue_number: row.calculated_issue_number ?? 0,
    title: row.title,
    date: row.date,
    description: row.description ?? '',
    monitored: Boolean(row.monitored),
    files: parseJson<ComicFileRef[]>(row.files, []),
  };
}

function rowToDetail(row: ComicRow, issues: ComicIssueSummary[]): ComicVolumeDetail {
  return {
    ...rowToVolume(row),
    special_version: row.special_version,
    special_version_locked: Boolean(row.special_version_locked),
    site_url: row.site_url ?? '',
    root_folder: row.root_folder ?? 0,
    volume_folder: row.volume_folder ?? '',
    issues,
    general_files: parseJson<ComicGeneralFile[]>(row.general_files, []),
  };
}

export async function getCachedComic(id: number): Promise<ComicVolumeSummary | null> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<ComicRow>(
    'SELECT * FROM comics WHERE id = ? AND deleted_at IS NULL',
    [id]
  );
  return row ? rowToVolume(row) : null;
}

export async function getCachedComicDetail(id: number): Promise<ComicVolumeDetail | null> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<ComicRow>(
    'SELECT * FROM comics WHERE id = ? AND deleted_at IS NULL',
    [id]
  );
  if (!row || !row.detail_cached_at) return null;
  const issueRows = await db.getAllAsync<IssueRow>(
    'SELECT * FROM comic_issues WHERE volume_id = ? AND deleted_at IS NULL ORDER BY calculated_issue_number',
    [id]
  );
  return rowToDetail(row, issueRows.map(rowToIssue));
}

export async function getCachedComics(): Promise<ComicVolumeSummary[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<ComicRow>(
    'SELECT * FROM comics WHERE deleted_at IS NULL ORDER BY title'
  );
  return rows.map(rowToVolume);
}

/**
 * Search the cached comics by title or publisher.
 *
 * Used when the server can't be reached, so searching still works offline
 * across whatever has been synced to the device. `LIKE` is enough here: the
 * cache holds one row per volume, not per issue.
 */
export async function searchCachedComics(query: string): Promise<ComicVolumeSummary[]> {
  const trimmed = query.trim();
  if (!trimmed) return getCachedComics();

  const db = await getDatabase();
  // Escape LIKE wildcards so a title containing % or _ still matches literally.
  const pattern = `%${trimmed.replace(/[\\%_]/g, '\\$&')}%`;
  const rows = await db.getAllAsync<ComicRow>(
    `SELECT * FROM comics
      WHERE deleted_at IS NULL
        AND (title LIKE ? ESCAPE '\\' OR publisher LIKE ? ESCAPE '\\')
      ORDER BY title`,
    [pattern, pattern]
  );
  return rows.map(rowToVolume);
}

const UPSERT_COMIC_LIST_SQL = `INSERT INTO comics (
  id, comicvine_id, slug, title, year, publisher, volume_number, description,
  monitored, monitor_new_issues, folder,
  issue_count, issue_count_monitored, issues_downloaded, issues_downloaded_monitored,
  total_size, updated_at, deleted_at
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, NULL)
ON CONFLICT (id) DO UPDATE SET
  comicvine_id = excluded.comicvine_id,
  slug = excluded.slug,
  title = excluded.title,
  year = excluded.year,
  publisher = excluded.publisher,
  volume_number = excluded.volume_number,
  description = excluded.description,
  monitored = excluded.monitored,
  monitor_new_issues = excluded.monitor_new_issues,
  folder = excluded.folder,
  issue_count = excluded.issue_count,
  issue_count_monitored = excluded.issue_count_monitored,
  issues_downloaded = excluded.issues_downloaded,
  issues_downloaded_monitored = excluded.issues_downloaded_monitored,
  total_size = excluded.total_size,
  updated_at = CURRENT_TIMESTAMP,
  deleted_at = NULL`;

export async function upsertComicVolume(volume: ComicVolumeSummary): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(UPSERT_COMIC_LIST_SQL, [
    volume.id,
    volume.comicvine_id,
    volume.slug,
    volume.title,
    volume.year,
    volume.publisher,
    volume.volume_number,
    volume.description,
    volume.monitored ? 1 : 0,
    volume.monitor_new_issues ? 1 : 0,
    volume.folder,
    volume.issue_count,
    volume.issue_count_monitored,
    volume.issues_downloaded,
    volume.issues_downloaded_monitored,
    volume.total_size,
  ]);
}

export async function upsertComicVolumes(volumes: ComicVolumeSummary[]): Promise<void> {
  const db = await getDatabase();
  await db.withTransactionAsync(async () => {
    for (const v of volumes) {
      await db.runAsync(UPSERT_COMIC_LIST_SQL, [
        v.id,
        v.comicvine_id,
        v.slug,
        v.title,
        v.year,
        v.publisher,
        v.volume_number,
        v.description,
        v.monitored ? 1 : 0,
        v.monitor_new_issues ? 1 : 0,
        v.folder,
        v.issue_count,
        v.issue_count_monitored,
        v.issues_downloaded,
        v.issues_downloaded_monitored,
        v.total_size,
      ]);
    }
  });
}

const UPSERT_COMIC_DETAIL_SQL = `INSERT INTO comics (
  id, comicvine_id, slug, title, year, publisher, volume_number, description,
  monitored, monitor_new_issues, folder,
  issue_count, issue_count_monitored, issues_downloaded, issues_downloaded_monitored,
  total_size, special_version, special_version_locked, site_url, root_folder, volume_folder,
  general_files, updated_at, detail_cached_at, deleted_at
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL)
ON CONFLICT (id) DO UPDATE SET
  comicvine_id = excluded.comicvine_id,
  slug = excluded.slug,
  title = excluded.title,
  year = excluded.year,
  publisher = excluded.publisher,
  volume_number = excluded.volume_number,
  description = excluded.description,
  monitored = excluded.monitored,
  monitor_new_issues = excluded.monitor_new_issues,
  folder = excluded.folder,
  issue_count = excluded.issue_count,
  issue_count_monitored = excluded.issue_count_monitored,
  issues_downloaded = excluded.issues_downloaded,
  issues_downloaded_monitored = excluded.issues_downloaded_monitored,
  total_size = excluded.total_size,
  special_version = excluded.special_version,
  special_version_locked = excluded.special_version_locked,
  site_url = excluded.site_url,
  root_folder = excluded.root_folder,
  volume_folder = excluded.volume_folder,
  general_files = excluded.general_files,
  updated_at = CURRENT_TIMESTAMP,
  detail_cached_at = CURRENT_TIMESTAMP,
  deleted_at = NULL`;

const UPSERT_ISSUE_SQL = `INSERT INTO comic_issues (
  id, volume_id, comicvine_id, issue_number, calculated_issue_number,
  title, date, description, monitored, files, updated_at, deleted_at
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, NULL)
ON CONFLICT (id) DO UPDATE SET
  volume_id = excluded.volume_id,
  comicvine_id = excluded.comicvine_id,
  issue_number = excluded.issue_number,
  calculated_issue_number = excluded.calculated_issue_number,
  title = excluded.title,
  date = excluded.date,
  description = excluded.description,
  monitored = excluded.monitored,
  files = excluded.files,
  updated_at = CURRENT_TIMESTAMP,
  deleted_at = NULL`;

export async function upsertComicDetail(detail: ComicVolumeDetail): Promise<void> {
  const db = await getDatabase();
  await db.withTransactionAsync(async () => {
    await db.runAsync(UPSERT_COMIC_DETAIL_SQL, [
      detail.id,
      detail.comicvine_id,
      detail.slug,
      detail.title,
      detail.year,
      detail.publisher,
      detail.volume_number,
      detail.description,
      detail.monitored ? 1 : 0,
      detail.monitor_new_issues ? 1 : 0,
      detail.folder,
      detail.issue_count,
      detail.issue_count_monitored,
      detail.issues_downloaded,
      detail.issues_downloaded_monitored,
      detail.total_size,
      detail.special_version,
      detail.special_version_locked ? 1 : 0,
      detail.site_url,
      detail.root_folder,
      detail.volume_folder,
      JSON.stringify(detail.general_files ?? []),
    ]);

    const incomingIds = new Set<number>();
    for (const issue of detail.issues) {
      incomingIds.add(issue.id);
      await db.runAsync(UPSERT_ISSUE_SQL, [
        issue.id,
        issue.volume_id,
        issue.comicvine_id,
        issue.issue_number,
        issue.calculated_issue_number,
        issue.title,
        issue.date,
        issue.description,
        issue.monitored ? 1 : 0,
        JSON.stringify(issue.files ?? []),
      ]);
    }

    const existing = await db.getAllAsync<{ id: number }>(
      'SELECT id FROM comic_issues WHERE volume_id = ? AND deleted_at IS NULL',
      [detail.id]
    );
    for (const { id } of existing) {
      if (!incomingIds.has(id)) {
        await db.runAsync(
          'UPDATE comic_issues SET deleted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
          [id]
        );
      }
    }
  });
}

export async function softDeleteComic(id: number): Promise<void> {
  const db = await getDatabase();
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      'UPDATE comics SET deleted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND deleted_at IS NULL',
      [id]
    );
    await db.runAsync(
      'UPDATE comic_issues SET deleted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE volume_id = ? AND deleted_at IS NULL',
      [id]
    );
  });
}

export async function isComicDetailStale(id: number, maxAgeMinutes: number): Promise<boolean> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<{ detail_cached_at: string | null }>(
    'SELECT detail_cached_at FROM comics WHERE id = ?',
    [id]
  );
  if (!row?.detail_cached_at) return true;
  const cachedAt = new Date(row.detail_cached_at.endsWith('Z') ? row.detail_cached_at : row.detail_cached_at + 'Z');
  const diffMinutes = (Date.now() - cachedAt.getTime()) / 60000;
  return diffMinutes > maxAgeMinutes;
}
