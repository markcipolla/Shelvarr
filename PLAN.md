# Shelvarr - Implementation Plan

A self-hosted *arr-style web application for book/comic metadata management and file organization, designed to work alongside Komga and Komf.

> **Note**: This PLAN.md must be kept up-to-date at each implementation stage. Mark tasks as complete `[x]` as they are finished.

## Tech Stack

- **Backend**: Node.js with Express.js + **TypeScript**
- **Frontend**: Vanilla JS + Tailwind CSS (no heavy frameworks)
- **Database**: SQLite with better-sqlite3
- **Queue**: In-memory job queue (optional Redis for scale)
- **Testing**: Playwright (E2E) + Node test runner (unit/integration)
- **Linting**: ESLint with TypeScript support
- **Container**: Docker + Docker Compose

## Project Structure

```
shelvarr/
├── PLAN.md                      # This file - keep updated!
├── docker-compose.yml
├── Dockerfile
├── package.json
├── tsconfig.json                # TypeScript configuration
├── eslint.config.js             # ESLint flat config
├── tailwind.config.js
├── playwright.config.js
├── src/
│   ├── index.ts                 # Express app entry
│   ├── types/
│   │   └── index.ts             # Domain types (Book, Library, Author, etc.)
│   ├── config/
│   │   └── index.ts             # Environment config
│   ├── db/
│   │   ├── index.ts             # SQLite connection
│   │   └── schema.sql           # Database schema
│   ├── routes/
│   │   └── index.ts             # API routes
│   ├── services/                # (To be implemented)
│   │   ├── metadata/
│   │   ├── komga/
│   │   ├── scanner/
│   │   ├── organizer/
│   │   ├── authors/
│   │   ├── acquisition/
│   │   └── queue/
│   └── public/
│       ├── index.html           # Main SPA shell
│       ├── css/
│       │   └── styles.css       # Tailwind input
│       └── js/
│           ├── app.js           # Main app logic
│           └── api.js           # API client
├── tests/
│   ├── unit/
│   │   └── config.test.ts       # Config tests
│   ├── integration/
│   │   └── api.test.ts          # API integration tests
│   └── e2e/
│       └── dashboard.spec.js    # Playwright E2E tests
└── dist/                        # Compiled TypeScript + built CSS
```

## Core Features

### 1. Library Management
- Add/configure library root paths
- Scan libraries for books (epub, pdf, cbz, cbr, mobi)
- Track file locations and metadata in SQLite

### 2. Metadata Fetching
- Search Google Books API by title/author/ISBN
- Search OpenLibrary API as fallback/supplement
- Manual metadata editing
- Batch metadata refresh

### 3. File Organization
- **Auto-rename**: `Author/Series/Book Title (Year).ext`
- **Configurable templates**: User-defined naming patterns
- **Preview mode**: Show changes before applying
- **Duplicate detection**: Hash-based + metadata similarity
- **Series detection**: Group books by detected series

### 4. Komga Integration
- Optional API connection (URL + credentials)
- Trigger library scans after reorganization
- Read existing library paths from Komga
- Fallback to file-only mode if not configured

### 5. Background Jobs
- Library scanning (can be large)
- Bulk metadata fetching
- Bulk file reorganization
- Job status tracking in UI

### 6. Author Bibliography & Missing Books
- Fetch complete author bibliography from OpenLibrary/Google Books
- Compare against owned books
- Show "missing" books for each author
- Track wanted books list

### 7. Book Acquisition (Phase 8 - Post-MVP)
- **Search sources**: Z-Library, Anna's Archive, Library Genesis
- Search by title, author, ISBN
- Download directly to appropriate library folder
- Auto-trigger metadata fetch + Komga scan after download
- **Note**: These are search aggregators; user responsibility for legal use

## Database Schema (SQLite)

```sql
-- Libraries
CREATE TABLE libraries (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  path TEXT NOT NULL UNIQUE,
  komga_library_id TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Books
CREATE TABLE books (
  id INTEGER PRIMARY KEY,
  library_id INTEGER REFERENCES libraries(id),
  file_path TEXT NOT NULL UNIQUE,
  file_hash TEXT,
  file_size INTEGER,
  title TEXT,
  authors TEXT,  -- JSON array
  series_name TEXT,
  series_number REAL,
  isbn TEXT,
  publisher TEXT,
  publish_date TEXT,
  description TEXT,
  cover_url TEXT,
  metadata_source TEXT,
  metadata_id TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Series (detected/grouped)
CREATE TABLE series (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  author TEXT,
  total_books INTEGER,
  metadata_source TEXT,
  metadata_id TEXT
);

-- Book-Series mapping
CREATE TABLE book_series (
  book_id INTEGER REFERENCES books(id),
  series_id INTEGER REFERENCES series(id),
  position REAL,
  PRIMARY KEY (book_id, series_id)
);

-- Tasks/Jobs
CREATE TABLE tasks (
  id INTEGER PRIMARY KEY,
  type TEXT NOT NULL,
  status TEXT DEFAULT 'pending',
  progress INTEGER DEFAULT 0,
  total INTEGER,
  result TEXT,
  error TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  completed_at DATETIME
);

-- Settings
CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value TEXT
);

-- Authors (for bibliography tracking)
CREATE TABLE authors (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  openlibrary_id TEXT,
  google_books_id TEXT,
  total_works INTEGER,
  last_synced DATETIME
);

-- Author works (full bibliography)
CREATE TABLE author_works (
  id INTEGER PRIMARY KEY,
  author_id INTEGER REFERENCES authors(id),
  title TEXT NOT NULL,
  isbn TEXT,
  publish_year INTEGER,
  metadata_source TEXT,
  metadata_id TEXT,
  owned INTEGER DEFAULT 0,  -- 0=missing, 1=owned
  book_id INTEGER REFERENCES books(id),  -- link if owned
  wanted INTEGER DEFAULT 0  -- user wants this book
);

-- Download queue
CREATE TABLE downloads (
  id INTEGER PRIMARY KEY,
  title TEXT NOT NULL,
  author TEXT,
  isbn TEXT,
  source TEXT,  -- zlibrary, annas, libgen
  source_url TEXT,
  status TEXT DEFAULT 'pending',  -- pending, downloading, completed, failed
  target_library_id INTEGER REFERENCES libraries(id),
  file_path TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  completed_at DATETIME
);
```

## API Endpoints

```
GET/POST   /api/libraries           - List/add libraries
GET/DELETE /api/libraries/:id       - Get/remove library
POST       /api/libraries/:id/scan  - Trigger scan

GET        /api/books               - List books (paginated, filtered)
GET        /api/books/:id           - Get book details
PUT        /api/books/:id           - Update book metadata
POST       /api/books/:id/refresh   - Re-fetch metadata
POST       /api/books/bulk-refresh  - Bulk metadata refresh

GET        /api/series              - List detected series
POST       /api/series/:id/organize - Organize series files

POST       /api/organize/preview    - Preview reorganization
POST       /api/organize/apply      - Apply reorganization
GET        /api/duplicates          - Get duplicate candidates

GET        /api/tasks               - List background tasks
GET        /api/tasks/:id           - Get task status

GET/PUT    /api/settings            - App settings
GET        /api/settings/komga/test - Test Komga connection

GET        /api/authors             - List tracked authors
POST       /api/authors             - Add author to track
GET        /api/authors/:id         - Get author details + bibliography
POST       /api/authors/:id/sync    - Refresh bibliography from sources
GET        /api/authors/:id/missing - Get missing books for author
POST       /api/authors/:id/want/:workId - Mark work as wanted

GET        /api/search/books        - Search Z-Lib/Annas/Libgen
POST       /api/downloads           - Add to download queue
GET        /api/downloads           - List download queue
DELETE     /api/downloads/:id       - Cancel/remove download
```

## UI Pages

1. **Dashboard**: Overview, recent activity, quick actions
2. **Libraries**: Manage library paths, trigger scans
3. **Books**: Browse/search books, edit metadata, bulk actions
4. **Series**: View detected series, organize
5. **Duplicates**: Review and resolve duplicates
6. **Authors**: Track authors, view bibliography, see missing books
7. **Wanted**: List of wanted/missing books across all authors
8. **Search**: Search external sources (Z-Lib, Annas, Libgen)
9. **Downloads**: Download queue status
10. **Tasks**: Background job status
11. **Settings**: Komga config, naming templates, download settings

## Docker Compose

```yaml
version: '3.8'
services:
  shelvarr:
    build: .
    container_name: shelvarr
    ports:
      - "3000:3000"
    volumes:
      - ./data:/app/data              # SQLite + config
      - /path/to/ebooks:/libraries/ebooks:rw
      - /path/to/comics:/libraries/comics:rw
      - /path/to/audiobooks:/libraries/audiobooks:rw
      # Add as many library mounts as needed
    environment:
      - NODE_ENV=production
      - PORT=3000
      - DATA_DIR=/app/data
      - LIBRARY_ROOT=/libraries       # Base path for all libraries
    restart: unless-stopped
```

**Note**: Mount multiple library folders under `/libraries/` - Shelvarr will detect and let you manage each separately.

## Development Commands

```bash
# Install dependencies
npm install

# Development server (with hot reload)
npm run dev

# Build (TypeScript + CSS)
npm run build

# Linting
npm run lint          # Check for issues
npm run lint:fix      # Auto-fix issues

# Type checking
npm run typecheck

# Testing
npm test              # Unit + Integration tests
npm run test:e2e      # Playwright E2E tests
npm run test:coverage # Tests with coverage

# Docker
npm run docker:build
npm run docker:up
npm run docker:down
```

## Testing Strategy

### Test Coverage Requirements
- **Unit tests**: All utility functions and service methods
- **Integration tests**: All API endpoints
- **E2E tests**: All user flows via Playwright

### Test Structure
Each phase must include tests before marking complete:
- Unit tests for new utility/service code
- Integration tests for new API endpoints
- E2E tests for new UI features

---

## Implementation Progress

### Phase 1: Foundation ✅ COMPLETE
- [x] 1.1 Project scaffolding (package.json, Docker setup)
- [x] 1.2 Express server + basic routing
- [x] 1.3 SQLite database setup + schema
- [x] 1.4 Configuration management
- [x] 1.5 Basic UI shell with Tailwind
- [x] 1.6 Playwright + test infrastructure setup
- [x] 1.7 TypeScript conversion with strict types
- [x] 1.8 ESLint configuration
- [x] 1.9 **Tests**: Unit (6), Integration (11), E2E (10) - all passing

### Phase 2: Core Features ✅ COMPLETE
- [x] 2.1 Library management API (add, list, remove, scan)
- [x] 2.2 File scanner service (finds books, parses filenames, tracks changes)
- [x] 2.3 Book listing API with pagination and search
- [x] 2.4 Libraries UI page (add, scan, delete libraries)
- [x] 2.5 Books UI page with pagination, search, and library filter
- [x] 2.6 **Tests**: Unit (8 scanner), Integration (17 library/book APIs), E2E (14) - all passing

### Phase 3: Metadata ✅ COMPLETE
- [x] 3.1 Google Books API integration
- [x] 3.2 OpenLibrary API integration
- [x] 3.3 Metadata search/match API
- [x] 3.4 Manual metadata editing API
- [x] 3.5 Metadata UI (search, match, edit)
- [x] 3.6 **Tests**: Unit tests for metadata services (mocked), integration tests for metadata APIs, E2E for metadata workflow

### Phase 4: Organization ✅ COMPLETE
- [x] 4.1 File renaming service with templates
- [x] 4.2 Preview/apply reorganization API
- [x] 4.3 Duplicate detection service (hash + similarity)
- [x] 4.4 Series detection and grouping
- [x] 4.5 Organization UI (preview, apply, duplicates, series)
- [x] 4.6 **Tests**: Unit tests for renamer/duplicates/series, integration tests for organize APIs, E2E for organize workflow

### Phase 5: Komga Integration ✅ COMPLETE
- [x] 5.1 Komga API client
- [x] 5.2 Komga library sync
- [x] 5.3 Post-reorganization scan triggers
- [x] 5.4 Settings UI for Komga config
- [x] 5.5 **Tests**: Unit tests for Komga client (mocked), integration tests for Komga settings, E2E for Komga connection flow

### Phase 6: Background Jobs & Polish
- [ ] 6.1 Background job queue implementation
- [ ] 6.2 Task status API
- [ ] 6.3 Tasks UI page
- [ ] 6.4 Error handling + logging
- [ ] 6.5 Dashboard with activity feed
- [ ] 6.6 **Tests**: Integration tests for task APIs, E2E for dashboard and task status

### Phase 7: Author Tracking & Wanted List
- [ ] 7.1 Author bibliography service (OpenLibrary API)
- [ ] 7.2 Missing books detection
- [ ] 7.3 Wanted list management API
- [ ] 7.4 Authors UI page
- [ ] 7.5 Wanted UI page
- [ ] 7.6 **Tests**: Unit tests for author service, integration tests for author APIs, E2E for author/wanted workflow

### Phase 8: Book Acquisition
- [ ] 8.1 Z-Library search integration
- [ ] 8.2 Anna's Archive search integration
- [ ] 8.3 Library Genesis search integration
- [ ] 8.4 Download manager service
- [ ] 8.5 Search UI page
- [ ] 8.6 Downloads UI page
- [ ] 8.7 **Tests**: Unit tests for search services (mocked), integration tests for download APIs, E2E for search/download workflow

---

## Verification Checklist

After each phase, verify:

1. [ ] All tests pass: `npm test && npm run test:e2e`
2. [ ] Lint passes: `npm run lint`
3. [ ] Type check passes: `npm run typecheck`
4. [ ] Docker build succeeds: `docker-compose build`
5. [ ] App starts correctly: `docker-compose up`
6. [ ] New features work in browser at http://localhost:3000
7. [ ] PLAN.md updated with completed tasks marked `[x]`

## Final Verification

1. **Build**: `docker-compose build` succeeds
2. **Run**: `docker-compose up` starts server on port 3000
3. **Tests**: `npm test && npm run test:e2e` all pass
4. **Lint**: `npm run lint` passes
5. **UI**: Navigate to http://localhost:3000, see dashboard
6. **Add library**: Add a test book folder, verify scan works
7. **Metadata**: Search and apply metadata to a book
8. **Organize**: Preview and apply file reorganization
9. **Authors**: Track author, see missing books
10. **Search**: Search and download a book
11. **Komga**: (If configured) Verify scan trigger works
