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
