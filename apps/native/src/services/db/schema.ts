/**
 * Local SQLite schema for the native app's offline metadata cache.
 * Mirrors a subset of the server's schema.sql, enough to render detail
 * pages, browse lists, and search while offline.
 */

export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS comics (
  id INTEGER PRIMARY KEY,
  comicvine_id INTEGER,
  slug TEXT,
  title TEXT NOT NULL,
  year INTEGER,
  publisher TEXT,
  volume_number INTEGER,
  description TEXT,
  monitored INTEGER DEFAULT 1,
  monitor_new_issues INTEGER DEFAULT 0,
  folder TEXT,
  issue_count INTEGER,
  issue_count_monitored INTEGER,
  issues_downloaded INTEGER,
  issues_downloaded_monitored INTEGER,
  total_size INTEGER,
  special_version TEXT,
  special_version_locked INTEGER,
  site_url TEXT,
  root_folder INTEGER,
  volume_folder TEXT,
  general_files TEXT,
  cached_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  detail_cached_at TEXT,
  deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS comic_issues (
  id INTEGER PRIMARY KEY,
  volume_id INTEGER NOT NULL,
  comicvine_id INTEGER,
  issue_number TEXT,
  calculated_issue_number REAL,
  title TEXT,
  date TEXT,
  description TEXT,
  monitored INTEGER DEFAULT 1,
  files TEXT,
  cached_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS books (
  id INTEGER PRIMARY KEY,
  library_id INTEGER,
  file_path TEXT,
  title TEXT,
  authors TEXT,
  series_name TEXT,
  series_number REAL,
  isbn TEXT,
  publisher TEXT,
  publish_date TEXT,
  description TEXT,
  cover_url TEXT,
  metadata_source TEXT,
  metadata_id TEXT,
  cached_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS sync_state (
  entity TEXT PRIMARY KEY,
  last_synced_at TEXT,
  last_cursor TEXT
);

CREATE INDEX IF NOT EXISTS idx_comics_title ON comics(title);
CREATE INDEX IF NOT EXISTS idx_comics_updated_at ON comics(updated_at);
CREATE INDEX IF NOT EXISTS idx_comic_issues_volume ON comic_issues(volume_id);
CREATE INDEX IF NOT EXISTS idx_books_title ON books(title);
CREATE INDEX IF NOT EXISTS idx_books_updated_at ON books(updated_at);

CREATE VIRTUAL TABLE IF NOT EXISTS books_fts USING fts5(
  title,
  authors,
  series_name,
  isbn,
  content='books',
  content_rowid='id',
  tokenize='porter unicode61'
);

CREATE TRIGGER IF NOT EXISTS books_fts_ai AFTER INSERT ON books BEGIN
  INSERT INTO books_fts (rowid, title, authors, series_name, isbn)
  VALUES (new.id, new.title, new.authors, new.series_name, new.isbn);
END;

CREATE TRIGGER IF NOT EXISTS books_fts_ad AFTER DELETE ON books BEGIN
  INSERT INTO books_fts (books_fts, rowid, title, authors, series_name, isbn)
  VALUES ('delete', old.id, old.title, old.authors, old.series_name, old.isbn);
END;

CREATE TRIGGER IF NOT EXISTS books_fts_au AFTER UPDATE ON books BEGIN
  INSERT INTO books_fts (books_fts, rowid, title, authors, series_name, isbn)
  VALUES ('delete', old.id, old.title, old.authors, old.series_name, old.isbn);
  INSERT INTO books_fts (rowid, title, authors, series_name, isbn)
  VALUES (new.id, new.title, new.authors, new.series_name, new.isbn);
END;

CREATE VIRTUAL TABLE IF NOT EXISTS comics_fts USING fts5(
  title,
  publisher,
  description,
  content='comics',
  content_rowid='id',
  tokenize='porter unicode61'
);

CREATE TRIGGER IF NOT EXISTS comics_fts_ai AFTER INSERT ON comics BEGIN
  INSERT INTO comics_fts (rowid, title, publisher, description)
  VALUES (new.id, new.title, new.publisher, new.description);
END;

CREATE TRIGGER IF NOT EXISTS comics_fts_ad AFTER DELETE ON comics BEGIN
  INSERT INTO comics_fts (comics_fts, rowid, title, publisher, description)
  VALUES ('delete', old.id, old.title, old.publisher, old.description);
END;

CREATE TRIGGER IF NOT EXISTS comics_fts_au AFTER UPDATE ON comics BEGIN
  INSERT INTO comics_fts (comics_fts, rowid, title, publisher, description)
  VALUES ('delete', old.id, old.title, old.publisher, old.description);
  INSERT INTO comics_fts (rowid, title, publisher, description)
  VALUES (new.id, new.title, new.publisher, new.description);
END;
`;
