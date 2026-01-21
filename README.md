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

Create a `docker-compose.yml` file:

```yaml
services:
  shelvarr:
    image: ghcr.io/markcipolla/shelvarr:latest
    container_name: shelvarr
    ports:
      - "3000:3000"
    volumes:
      - shelvarr_data:/app/data
      # Mount your book libraries:
      - /path/to/ebooks:/libraries/ebooks:rw
      - /path/to/comics:/libraries/comics:rw
    environment:
      # Optional Komga integration:
      - KOMGA_URL=http://your-komga-server:25600
      - KOMGA_API_KEY=your-api-key
    restart: unless-stopped

volumes:
  shelvarr_data:
```

Then run:

```bash
docker-compose up -d
```

Open http://localhost:3000

### Docker (Build from Source)

```bash
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
# Run unit + integration tests
npm test

# Run E2E tests (requires Playwright browsers)
npx playwright install chromium
npm run test:e2e
```

## Configuration

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | 3000 | Server port |
| `DATA_DIR` | ./data | Data directory for SQLite database and app files |
| `LIBRARY_ROOT` | /libraries | Base path for library mounts |
| `KOMGA_URL` | - | Komga server URL |
| `KOMGA_API_KEY` | - | Komga Personal Access Token (create in Komga account settings) |

## Development Status

See [PLAN.md](./PLAN.md) for detailed implementation progress.

### Completed
- **Phase 1**: Foundation - Express.js, SQLite, TypeScript, Tailwind CSS
- **Phase 2**: Library management, file scanner, book listing
- **Phase 3**: Metadata fetching from Google Books and OpenLibrary
- **Phase 4**: File organization, duplicate detection, series grouping
- **Phase 5**: Komga integration

## License

MIT
