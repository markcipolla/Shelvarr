# Shelvarr

A self-hosted *arr-style web application for book/comic metadata management and file organization, designed to work alongside [Komga](https://komga.org/) and [Komf](https://github.com/Snd-R/komf).

## Features

- **Library Management**: Scan and organize book libraries (epub, pdf, cbz, cbr, mobi)
- **Metadata Fetching**: Search Google Books and OpenLibrary for metadata
- **File Organization**: Auto-rename files with configurable templates
- **Duplicate Detection**: Find duplicate books using hash + metadata similarity
- **Series Detection**: Automatically group books into series
- **Author Tracking**: Track authors and find missing books in your collection
- **Book Acquisition**: Search Z-Library, Anna's Archive, and Library Genesis (planned)
- **Komga Integration**: Trigger library scans after reorganization

## Quick Start

### Docker from GHCR (Recommended)

Pull the pre-built image from GitHub Container Registry:

```bash
# Download the example compose file
curl -O https://raw.githubusercontent.com/YOUR_USERNAME/shelvarr/main/docker-compose.ghcr.yml

# Edit the file to:
# 1. Replace YOUR_USERNAME with the actual GitHub username/org
# 2. Update volume mounts for your book libraries

# Start the stack
docker-compose -f docker-compose.ghcr.yml up -d
```

Then open http://localhost:3000

### Docker (Build from Source)

```bash
# Clone and build
git clone <repo-url> shelvarr
cd shelvarr
docker-compose up -d
```

Then open http://localhost:3000

### Development

```bash
# Install dependencies
npm install

# Build CSS
npm run build

# Start development server
npm run dev
```

### Running Tests

```bash
# Unit + Integration tests
npm test

# E2E tests (requires Playwright browsers)
npx playwright install chromium
npm run test:e2e
```

## Configuration

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | 3000 | Server port |
| `DATA_DIR` | ./data | Data directory for SQLite database |
| `LIBRARY_ROOT` | /libraries | Base path for library mounts |
| `KOMGA_URL` | - | Komga server URL |
| `KOMGA_USERNAME` | - | Komga username |
| `KOMGA_PASSWORD` | - | Komga password |

### Docker Compose

Mount your book libraries under `/libraries/`:

```yaml
volumes:
  - ./data:/app/data
  - /path/to/ebooks:/libraries/ebooks:rw
  - /path/to/comics:/libraries/comics:rw
```

## Development Status

See [PLAN.md](./PLAN.md) for detailed implementation progress.

### Current Phase: 1 (Foundation) ✅ Complete

- Express.js server with API routing
- SQLite database with schema
- Tailwind CSS UI shell
- Playwright E2E test infrastructure

## License

MIT
