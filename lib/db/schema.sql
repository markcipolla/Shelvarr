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
  metadata_source TEXT,
  metadata_id TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
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
