-- Shelvarr Database Schema (SQLite)

-- Libraries
CREATE TABLE IF NOT EXISTS libraries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  path TEXT NOT NULL UNIQUE,
  type TEXT DEFAULT 'book', -- 'book' or 'comic'
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
  completed_at TEXT,
  -- Naked-UTC timestamp (see the Timestamps note in packages/db/src/index.ts)
  -- before which a rate-limited task should not be retried. Set alongside the
  -- in-memory retry queue so a restart can rebuild it instead of losing it;
  -- cleared once the task leaves the retry queue for any reason.
  not_before TEXT
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
  source TEXT NOT NULL UNIQUE, -- ebooks: zlibrary, annas, libgen; comics: getcomics
  enabled INTEGER DEFAULT 1,
  credentials TEXT, -- JSON: {email, password} for zlibrary
  last_checked TEXT
);

-- Mirror domains for the shadow-library sources (libgen, annas, zlibrary).
--
-- These were hardcoded constants in the download services, so following a
-- domain rotation meant shipping a new image. The table is seeded from those
-- same shipped defaults on first run and edited in Settings -> Download
-- Sources; `source_status_cache` keys each mirror's health off the row
-- (`<source>:<domain>`), so a mirror added at 11pm is probed and ranked
-- exactly like a seeded one.
CREATE TABLE IF NOT EXISTS source_mirrors (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source TEXT NOT NULL, -- libgen, annas, zlibrary
  domain TEXT NOT NULL, -- bare hostname, no scheme
  priority INTEGER NOT NULL DEFAULT 0, -- lower sorts first
  enabled INTEGER NOT NULL DEFAULT 1,
  added_by TEXT NOT NULL DEFAULT 'user', -- seed | user
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (source, domain)
);

-- Cache for source status from open-slum.org
CREATE TABLE IF NOT EXISTS source_status_cache (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL, -- up, down, degraded
  response_time INTEGER, -- ms
  last_updated TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Daily limits and rate limits a download source is currently waiting out
-- (E1-6). One row per source while it is spent; the row is deleted once the
-- deadline passes. Kept in the database rather than in memory so a restart
-- mid-wait doesn't hand the whole queue back a quota it has already spent —
-- the same reasoning as tasks.not_before.
CREATE TABLE IF NOT EXISTS source_limits (
  source TEXT PRIMARY KEY, -- libgen, annas, zlibrary, getcomics
  -- Naked-UTC timestamp (see the Timestamps note in packages/db/src/index.ts)
  -- before which nothing from this source should be downloaded.
  retry_after TEXT NOT NULL,
  reason TEXT,
  recorded_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Read progress (page-based, for the reader API)
--
-- user_id 0 is the shared shelf: it is what a server with accounts switched
-- off writes to, and where requests authenticated with the legacy shared API
-- key land, since that key carries access but no identity. A real account's
-- id is never 0, so per-user rows can never collide with it.
CREATE TABLE IF NOT EXISTS read_progress (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  book_id INTEGER NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL DEFAULT 0,
  page INTEGER NOT NULL DEFAULT 0,
  completed INTEGER NOT NULL DEFAULT 0,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(book_id, user_id)
);

-- Cached Hardcover.app reading statuses, pulled from the user's account.
-- Keyed by Hardcover book id (matches books.metadata_id when
-- metadata_source = 'hardcover'). Status ids follow Hardcover's convention:
-- 1 = want to read, 2 = currently reading, 3 = read, 5 = did not finish.
--
-- Deliberately not per-user: Hardcover is configured once for the whole
-- server with a single token, so there is only ever one account's worth of
-- statuses to cache. Everyone sees the same ones.
CREATE TABLE IF NOT EXISTS hardcover_reading_status (
  hardcover_id TEXT PRIMARY KEY,
  status_id INTEGER NOT NULL,
  synced_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Comic read progress (comic issues; not in books table, so no FK)
-- user_id follows the same convention as read_progress: 0 is the shared shelf.
CREATE TABLE IF NOT EXISTS comic_read_progress (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  issue_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL DEFAULT 0,
  page INTEGER NOT NULL DEFAULT 0,
  completed INTEGER NOT NULL DEFAULT 0,
  total INTEGER,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(issue_id, user_id)
);

-- Comics (volumes)
-- Ids are stable: read progress and the native app's cache reference them.
CREATE TABLE IF NOT EXISTS comics (
  id INTEGER PRIMARY KEY,
  comicvine_id INTEGER,
  title TEXT NOT NULL,
  -- What /comics/<slug> uses. Assigned once from the title and year, then
  -- left alone so saved links keep working across metadata refreshes.
  slug TEXT,
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
-- Positions roam across a person's devices, not across people, so user_id
-- sits alongside device_id in the key. 0 is the shared shelf.
CREATE TABLE IF NOT EXISTS epub_progression (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  book_id INTEGER NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL DEFAULT 0,
  device_id TEXT NOT NULL DEFAULT 'default',
  locator TEXT NOT NULL, -- JSON: EPUB CFI/position data
  progression REAL NOT NULL DEFAULT 0, -- 0-1 percentage
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(book_id, user_id, device_id)
);

-- How someone likes their reader set up: type size, typeface, line height,
-- margins, light/sepia/dark.
--
-- Deliberately NOT per-device, which is the whole difference between this and
-- epub_progression above. Where you are in a book is a property of the copy
-- in your hands; how big you like the type is a property of your eyes, and
-- should follow you from the laptop to the tablet without being set twice.
--
-- Stored as one JSON blob rather than a column per setting: this is a bag of
-- presentation preferences that will keep growing, it is only ever read and
-- written whole, and nothing ever queries or aggregates across it. The
-- reader normalises and clamps whatever comes back, so an older or newer
-- client's extra keys are harmless.
--
-- user_id 0 is the shared shelf, same convention as read_progress.
CREATE TABLE IF NOT EXISTS reader_preferences (
  user_id INTEGER PRIMARY KEY,
  preferences TEXT NOT NULL, -- JSON
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Bookmarks and highlights. Both are "a place in a book that matters to one
-- person", differing only in whether they span a range of text, so they share
-- a table and are told apart by `kind`.
--
-- Per-user and per-book, but not per-device: a passage you highlighted on the
-- sofa should be there on the train.
--
-- cfi is an EPUB CFI — a range for a highlight, a point for a bookmark. It is
-- opaque to the server; only the reader interprets it.
CREATE TABLE IF NOT EXISTS reader_annotations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  book_id INTEGER NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL DEFAULT 0,
  kind TEXT NOT NULL, -- bookmark|highlight
  cfi TEXT NOT NULL,
  -- The selected text for a highlight, or the chapter/position label for a
  -- bookmark, so the list is readable without re-opening every location.
  text TEXT,
  colour TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(book_id, user_id, kind, cfi)
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
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_wanted_books_status ON wanted_books(status);
CREATE INDEX IF NOT EXISTS idx_wanted_books_title ON wanted_books(title);
CREATE INDEX IF NOT EXISTS idx_source_status_cache_source ON source_status_cache(source);
CREATE INDEX IF NOT EXISTS idx_source_mirrors_source ON source_mirrors(source, priority);
CREATE INDEX IF NOT EXISTS idx_read_progress_book ON read_progress(book_id);
CREATE INDEX IF NOT EXISTS idx_hardcover_status_status ON hardcover_reading_status(status_id);
CREATE INDEX IF NOT EXISTS idx_comic_read_progress_issue ON comic_read_progress(issue_id);
CREATE INDEX IF NOT EXISTS idx_epub_progression_book ON epub_progression(book_id);
CREATE INDEX IF NOT EXISTS idx_comics_title ON comics(title);
-- idx_comics_slug is created by the migration step instead: this file also runs
-- against libraries whose comics table predates the slug column, and the index
-- has to wait until the ALTER TABLE has added it.
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
  -- Why it failed, in a form the UI can phrase itself instead of showing the
  -- raw error: rate-limited|link-broken|download-failed|import-failed|
  -- library-unwritable. Null unless state = 'failed'.
  failure_reason TEXT,
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
  -- Same vocabulary as comic_downloads.failure_reason; null on a success.
  failure_reason TEXT,
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
  reason TEXT NOT NULL, -- link-broken|source-not-supported|no-working-links|failed-verification|added-by-user
  added_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_comic_downloads_state ON comic_downloads(state);
-- idx_comic_downloads_heartbeat is created by the migration step instead: this
-- file is replayed over existing databases, where the column it indexes does
-- not exist until that step has run.
CREATE INDEX IF NOT EXISTS idx_comic_downloads_volume ON comic_downloads(volume_id);
CREATE INDEX IF NOT EXISTS idx_comic_download_history_volume ON comic_download_history(volume_id);
CREATE INDEX IF NOT EXISTS idx_comic_blocklist_link ON comic_blocklist(download_link);

-- Book acquisition (LibGen/Anna's Archive/Z-Library sourcing)
-- Mirrors the comic_downloads/comic_download_history/comic_blocklist trio
-- above, shaped for a single-file book download instead of a comic volume's
-- issues. Replaces the old `downloads` table, which nothing ever read or
-- wrote (see the migration that drops it).
CREATE TABLE IF NOT EXISTS book_downloads (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  -- Null until the download has landed: the book row is only created partway
  -- through the handler, once the file is on disk.
  book_id INTEGER REFERENCES books(id) ON DELETE SET NULL,
  wanted_book_id INTEGER REFERENCES wanted_books(id) ON DELETE SET NULL,
  library_id INTEGER NOT NULL REFERENCES libraries(id) ON DELETE CASCADE,
  source TEXT NOT NULL, -- libgen|annas|zlibrary
  title TEXT NOT NULL,
  author TEXT,
  extension TEXT NOT NULL,
  download_url TEXT NOT NULL,
  md5 TEXT, -- only libgen/annas identify a file by hash
  -- Other mirrors resolved for the same file, tried in order if the current
  -- one dies mid-stream (E2-3). JSON array of {url, filename, size,
  -- supportsRange, contentType} — a resolved, ready-to-stream link, unlike
  -- comic_downloads.alternate_links' unresolved {host, link} pairs.
  alternate_links TEXT,
  state TEXT NOT NULL DEFAULT 'queued', -- queued|downloading|importing|completed|failed|cancelled
  progress INTEGER NOT NULL DEFAULT 0,  -- bytes downloaded
  size INTEGER,                          -- total bytes, when known
  attempts INTEGER NOT NULL DEFAULT 0,
  file_path TEXT,                        -- final resting place once written
  error TEXT,
  -- Last sign of life, same convention as comic_downloads.heartbeat_at: a
  -- non-terminal row whose heartbeat has gone cold was orphaned by a process
  -- that stopped. (Nothing sweeps stalled book downloads yet — that is a
  -- later card; this column just gives it somewhere to read from.)
  heartbeat_at TEXT DEFAULT CURRENT_TIMESTAMP,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  completed_at TEXT
);

-- What we've downloaded before, so the UI can show history and auto-search
-- can avoid re-fetching.
CREATE TABLE IF NOT EXISTS book_download_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  wanted_book_id INTEGER REFERENCES wanted_books(id) ON DELETE SET NULL,
  library_id INTEGER REFERENCES libraries(id) ON DELETE SET NULL,
  source TEXT,
  title TEXT,
  author TEXT,
  download_url TEXT,
  success INTEGER NOT NULL DEFAULT 1,
  downloaded_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Links that turned out to be dead or unusable. Checked before enqueuing so
-- the same broken link isn't retried every search.
CREATE TABLE IF NOT EXISTS book_blocklist (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  wanted_book_id INTEGER REFERENCES wanted_books(id) ON DELETE SET NULL,
  library_id INTEGER REFERENCES libraries(id) ON DELETE SET NULL,
  title TEXT,
  author TEXT,
  source TEXT,
  download_url TEXT NOT NULL UNIQUE,
  reason TEXT NOT NULL, -- link-broken|no-working-links|failed-verification|added-by-user
  added_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_book_downloads_state ON book_downloads(state);
CREATE INDEX IF NOT EXISTS idx_book_downloads_heartbeat ON book_downloads(state, heartbeat_at);
CREATE INDEX IF NOT EXISTS idx_book_download_history_library ON book_download_history(library_id);
CREATE INDEX IF NOT EXISTS idx_book_blocklist_link ON book_blocklist(download_url);

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

-- User accounts
-- Passwordless: there is no password column and never should be. A person
-- proves who they are by receiving a one-time code at their email address.
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  -- NOCASE so Bob@example.com and bob@example.com are the same account.
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  name TEXT,
  role TEXT NOT NULL DEFAULT 'user', -- admin|user
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  last_login_at TEXT
);

-- Live sessions. Only the SHA-256 of each token is stored, so a copy of the
-- database does not hand out logins.
CREATE TABLE IF NOT EXISTS auth_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  client TEXT NOT NULL DEFAULT 'web', -- web|native
  label TEXT,                          -- user agent or device name
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  last_seen_at TEXT DEFAULT CURRENT_TIMESTAMP,
  expires_at TEXT NOT NULL
);

-- One-time sign-in codes.
--
-- The code is six characters read out of an email and typed back in, so it is
-- far weaker than a session token. Three things make that safe: it expires in
-- minutes, it is bound to the address that asked for it, and `attempts` caps
-- how many guesses one code will tolerate before it is retired.
--
-- code_hash is deliberately not UNIQUE: six characters collide, and two
-- people holding the same code at once must not be an error. Lookup is always
-- by user, so a collision is invisible.
CREATE TABLE IF NOT EXISTS login_codes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code_hash TEXT NOT NULL,
  client TEXT NOT NULL DEFAULT 'web', -- web|native
  redirect_to TEXT,
  -- Wrong guesses so far. Brute force is the whole risk with a short code.
  attempts INTEGER NOT NULL DEFAULT 0,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  expires_at TEXT NOT NULL,
  -- Set when the code is accepted, in the same statement that mints the
  -- session, so one code is good for exactly one sign-in.
  consumed_at TEXT,
  -- Set when a code is retired without being used: superseded by a newer
  -- request, expired, or guessed at too often. Retired rows are kept rather
  -- than deleted so the rate limit can still count how often someone asked.
  revoked_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_auth_sessions_user ON auth_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_auth_sessions_expires ON auth_sessions(expires_at);
CREATE INDEX IF NOT EXISTS idx_login_codes_user ON login_codes(user_id);
CREATE INDEX IF NOT EXISTS idx_login_codes_expires ON login_codes(expires_at);
