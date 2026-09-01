-- Shelvarr Database Schema (SQLite)

-- Libraries
CREATE TABLE IF NOT EXISTS libraries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  path TEXT NOT NULL UNIQUE,
  type TEXT DEFAULT 'book', -- 'book' or 'comic'
  komga_library_id TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Books
CREATE TABLE IF NOT EXISTS books (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  library_id INTEGER REFERENCES libraries(id) ON DELETE CASCADE,
  file_path TEXT NOT NULL UNIQUE,
  file_hash TEXT,
  file_size INTEGER,
  extension TEXT,  -- File extension (epub, pdf, mobi, etc.)
  title TEXT,
  authors TEXT,  -- JSON array
  series TEXT,   -- JSON array of [seriesName, position] tuples
  series_name TEXT,  -- Primary series name (for queries/display)
  series_number REAL, -- Primary series position
  isbn TEXT,
  publisher TEXT,
  publish_date TEXT,
  description TEXT,
  cover_url TEXT,
  komga_book_id TEXT,
  metadata_source TEXT,
  metadata_id TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  deleted_at TEXT
);

-- Series (detected/grouped)
CREATE TABLE IF NOT EXISTS series (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  author TEXT,
  total_books INTEGER,
  metadata_source TEXT,
  metadata_id TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Book-Series mapping
CREATE TABLE IF NOT EXISTS book_series (
  book_id INTEGER REFERENCES books(id) ON DELETE CASCADE,
  series_id INTEGER REFERENCES series(id) ON DELETE CASCADE,
  position REAL,
  PRIMARY KEY (book_id, series_id)
);

-- Tasks/Jobs
CREATE TABLE IF NOT EXISTS tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL,
  status TEXT DEFAULT 'pending',
  progress INTEGER DEFAULT 0,
  total INTEGER,
  result TEXT,
  error TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  completed_at TEXT
);

-- Settings
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT
);

-- Authors (for bibliography tracking)
CREATE TABLE IF NOT EXISTS authors (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  openlibrary_id TEXT,
  google_books_id TEXT,
  total_works INTEGER,
  last_synced TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Author works (full bibliography)
CREATE TABLE IF NOT EXISTS author_works (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  author_id INTEGER REFERENCES authors(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  isbn TEXT,
  publish_year INTEGER,
  language TEXT,
  metadata_source TEXT,
  metadata_id TEXT,
  owned INTEGER DEFAULT 0,
  book_id INTEGER REFERENCES books(id) ON DELETE SET NULL,
  wanted INTEGER DEFAULT 0,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Download queue
CREATE TABLE IF NOT EXISTS downloads (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  author TEXT,
  isbn TEXT,
  source TEXT,
  source_url TEXT,
  status TEXT DEFAULT 'pending',
  target_library_id INTEGER REFERENCES libraries(id) ON DELETE SET NULL,
  file_path TEXT,
  error TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  completed_at TEXT
);

-- Wanted books (standalone, not tied to author_works)
CREATE TABLE IF NOT EXISTS wanted_books (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  hardcover_id TEXT,
  title TEXT NOT NULL,
  author TEXT,
  isbn TEXT,
  cover_url TEXT,
  description TEXT,
  added_at TEXT DEFAULT CURRENT_TIMESTAMP,
  priority INTEGER DEFAULT 0, -- 0=normal, 1=high
  notes TEXT,
  status TEXT DEFAULT 'wanted' -- wanted, searching, found, acquired
);

-- Download source configuration
CREATE TABLE IF NOT EXISTS download_source_config (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source TEXT NOT NULL UNIQUE, -- zlibrary, annas, libgen
  enabled INTEGER DEFAULT 1,
  credentials TEXT, -- JSON: {email, password} for zlibrary
  last_checked TEXT
);

-- Cache for source status from open-slum.org
CREATE TABLE IF NOT EXISTS source_status_cache (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL, -- up, down, degraded
  response_time INTEGER, -- ms
  last_updated TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Read progress (page-based, for Komga-compatible API)
CREATE TABLE IF NOT EXISTS read_progress (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  book_id INTEGER NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  page INTEGER NOT NULL DEFAULT 0,
  completed INTEGER NOT NULL DEFAULT 0,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(book_id)
);

-- Cached Hardcover.app reading statuses, pulled from the user's account.
-- Keyed by Hardcover book id (matches books.metadata_id when
-- metadata_source = 'hardcover'). Status ids follow Hardcover's convention:
-- 1 = want to read, 2 = currently reading, 3 = read, 5 = did not finish.
CREATE TABLE IF NOT EXISTS hardcover_reading_status (
  hardcover_id TEXT PRIMARY KEY,
  status_id INTEGER NOT NULL,
  synced_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Comic read progress (comic issues; not in books table, so no FK)
CREATE TABLE IF NOT EXISTS comic_read_progress (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  issue_id INTEGER NOT NULL UNIQUE,
  page INTEGER NOT NULL DEFAULT 0,
  completed INTEGER NOT NULL DEFAULT 0,
  total INTEGER,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Comics (volumes)
-- Ids are stable: read progress and the native app's cache reference them.
CREATE TABLE IF NOT EXISTS comics (
  id INTEGER PRIMARY KEY,
  comicvine_id INTEGER,
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

-- Comic issues
CREATE TABLE IF NOT EXISTS comic_issues (
  id INTEGER PRIMARY KEY,
  volume_id INTEGER NOT NULL REFERENCES comics(id) ON DELETE CASCADE,
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

-- EPUB progression tracking (CFI/position)
CREATE TABLE IF NOT EXISTS epub_progression (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  book_id INTEGER NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  device_id TEXT NOT NULL DEFAULT 'default',
  locator TEXT NOT NULL, -- JSON: EPUB CFI/position data
  progression REAL NOT NULL DEFAULT 0, -- 0-1 percentage
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(book_id, device_id)
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_books_library ON books(library_id);
CREATE INDEX IF NOT EXISTS idx_books_title ON books(title);
CREATE INDEX IF NOT EXISTS idx_books_authors ON books(authors);
CREATE INDEX IF NOT EXISTS idx_books_isbn ON books(isbn);
CREATE INDEX IF NOT EXISTS idx_books_series ON books(series_name);
CREATE INDEX IF NOT EXISTS idx_author_works_author ON author_works(author_id);
CREATE INDEX IF NOT EXISTS idx_author_works_owned ON author_works(owned);
CREATE INDEX IF NOT EXISTS idx_author_works_wanted ON author_works(wanted);
CREATE INDEX IF NOT EXISTS idx_downloads_status ON downloads(status);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_wanted_books_status ON wanted_books(status);
CREATE INDEX IF NOT EXISTS idx_wanted_books_title ON wanted_books(title);
CREATE INDEX IF NOT EXISTS idx_source_status_cache_source ON source_status_cache(source);
CREATE INDEX IF NOT EXISTS idx_read_progress_book ON read_progress(book_id);
CREATE INDEX IF NOT EXISTS idx_hardcover_status_status ON hardcover_reading_status(status_id);
CREATE INDEX IF NOT EXISTS idx_comic_read_progress_issue ON comic_read_progress(issue_id);
CREATE INDEX IF NOT EXISTS idx_epub_progression_book ON epub_progression(book_id);
CREATE INDEX IF NOT EXISTS idx_books_komga_book_id ON books(komga_book_id);
CREATE INDEX IF NOT EXISTS idx_comics_title ON comics(title);
CREATE INDEX IF NOT EXISTS idx_comics_updated_at ON comics(updated_at);
CREATE INDEX IF NOT EXISTS idx_comic_issues_volume ON comic_issues(volume_id);
CREATE INDEX IF NOT EXISTS idx_comic_issues_updated_at ON comic_issues(updated_at);

-- Full-text search indexes (FTS5). Contentless-delete tables kept in sync
-- with source tables via triggers below.
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

-- Comic acquisition (GetComics sourcing)
-- The queue of downloads Shelvarr has decided to fetch. One row per file.
CREATE TABLE IF NOT EXISTS comic_downloads (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  volume_id INTEGER NOT NULL REFERENCES comics(id) ON DELETE CASCADE,
  issue_id INTEGER,
  covered_issues TEXT, -- JSON: number | [start, end] | null
  host TEXT NOT NULL,  -- getcomics, pixeldrain, …
  download_link TEXT NOT NULL,
  web_link TEXT,       -- the GetComics article the link came from
  web_title TEXT,
  web_sub_title TEXT,
  filename_body TEXT,  -- what the file is renamed to on import
  alternate_links TEXT, -- JSON: [{host, link}] covering the same issues
  state TEXT NOT NULL DEFAULT 'queued', -- queued|downloading|importing|completed|failed|cancelled
  progress INTEGER NOT NULL DEFAULT 0,  -- bytes downloaded
  size INTEGER,                          -- total bytes, when the server says
  attempts INTEGER NOT NULL DEFAULT 0,   -- how many times it has been tried
  file_path TEXT,                        -- final resting place after import
  error TEXT,
  -- Last sign of life: bumped on progress and on every state change. A
  -- non-terminal download whose heartbeat has gone cold was orphaned by a
  -- process that stopped, and is picked back up by the resume sweep.
  heartbeat_at TEXT DEFAULT CURRENT_TIMESTAMP,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  completed_at TEXT
);

-- What we've downloaded before, so the UI can show history and auto-search
-- can avoid re-fetching.
CREATE TABLE IF NOT EXISTS comic_download_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  volume_id INTEGER REFERENCES comics(id) ON DELETE SET NULL,
  issue_id INTEGER,
  web_link TEXT,
  web_title TEXT,
  web_sub_title TEXT,
  file_title TEXT,
  host TEXT,
  success INTEGER NOT NULL DEFAULT 1,
  downloaded_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Links that turned out to be dead or unusable. Checked before enqueuing so
-- the same broken mirror isn't retried every search.
CREATE TABLE IF NOT EXISTS comic_blocklist (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  volume_id INTEGER REFERENCES comics(id) ON DELETE SET NULL,
  issue_id INTEGER,
  web_link TEXT,
  web_title TEXT,
  web_sub_title TEXT,
  download_link TEXT NOT NULL UNIQUE,
  host TEXT,
  reason TEXT NOT NULL, -- link-broken|source-not-supported|no-working-links|added-by-user
  added_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_comic_downloads_state ON comic_downloads(state);
-- idx_comic_downloads_heartbeat is created by the migration step instead: this
-- file is replayed over existing databases, where the column it indexes does
-- not exist until that step has run.
CREATE INDEX IF NOT EXISTS idx_comic_downloads_volume ON comic_downloads(volume_id);
CREATE INDEX IF NOT EXISTS idx_comic_download_history_volume ON comic_download_history(volume_id);
CREATE INDEX IF NOT EXISTS idx_comic_blocklist_link ON comic_blocklist(download_link);

-- Comic library ownership
-- Directories Shelvarr stores comics in. A volume's folder lives under one.
CREATE TABLE IF NOT EXISTS comic_root_folders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  path TEXT NOT NULL UNIQUE,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Comic files on disk. Authoritative for volumes with comics.managed = 1;
-- volumes not yet migrated still carry their files in comic_issues.files.
CREATE TABLE IF NOT EXISTS comic_files (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  volume_id INTEGER NOT NULL REFERENCES comics(id) ON DELETE CASCADE,
  filepath TEXT NOT NULL UNIQUE,
  size INTEGER NOT NULL DEFAULT 0,
  -- Files that belong to the volume but not to any issue: cover art,
  -- ComicInfo.xml, and so on.
  file_type TEXT NOT NULL DEFAULT 'issue', -- issue|cover|metadata|other
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Which issues a file satisfies. A collected edition covers many issues, so
-- this is deliberately many-to-many.
CREATE TABLE IF NOT EXISTS comic_issue_files (
  file_id INTEGER NOT NULL REFERENCES comic_files(id) ON DELETE CASCADE,
  issue_id INTEGER NOT NULL REFERENCES comic_issues(id) ON DELETE CASCADE,
  -- Set when a human linked the file by hand, so a rescan won't undo it.
  forced INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (file_id, issue_id)
);

CREATE INDEX IF NOT EXISTS idx_comic_files_volume ON comic_files(volume_id);
CREATE INDEX IF NOT EXISTS idx_comic_issue_files_issue ON comic_issue_files(issue_id);
CREATE INDEX IF NOT EXISTS idx_comic_root_folders_path ON comic_root_folders(path);

-- Recurring jobs. Rows are claimed with a single atomic UPDATE, so several
-- app processes sharing this database can run schedulers without doubling up.
CREATE TABLE IF NOT EXISTS scheduled_tasks (
  name TEXT PRIMARY KEY,
  task_type TEXT NOT NULL,
  interval_seconds INTEGER NOT NULL,
  next_run INTEGER NOT NULL,
  last_run INTEGER,
  enabled INTEGER NOT NULL DEFAULT 1,
  payload TEXT -- JSON passed to the task
);
