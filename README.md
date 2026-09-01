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
| `GETCOMICS_URL` | https://getcomics.org | GetComics base URL (change to use a mirror) |
| `GETCOMICS_DOWNLOAD_DIR` | `$DATA_DIR/downloads` | Scratch directory for in-flight comic downloads |
| `COMIC_LIBRARY_ROOT` | - | Where comic downloads are imported, if a volume has no folder recorded |
| `GETCOMICS_HOST_PREFERENCE` | getcomics,pixeldrain | Order to try download hosts in |
| `GETCOMICS_RENAME` | true | Rename imported files to the naming template; set `false` to keep original names |
| `SCHEDULER_ENABLED` | true | Set `false` to stop Shelvarr running recurring jobs in-process |
| `COMICVINE_API_KEY` | - | ComicVine key; normally set in Settings → Comics instead |
| `COMIC_PATH_MAP` | - | `from:to` prefix remap for a library's recorded paths, used while migrating |

#### Accounts and email

| Variable | Default | Description |
|----------|---------|-------------|
| `SHELVARR_AUTH_ENABLED` | true | Set `false` to turn user accounts off entirely and leave the server open |
| `SHELVARR_ALLOW_SIGNUP` | false | Starting value for self-signup; the toggle in **Settings → Users** wins once an admin has set it |
| `SHELVARR_URL` | - | Public base URL, used to build sign-in links. Set this if Shelvarr is behind a proxy or reached by hostname |
| `SHELVARR_LOGIN_LINK_TTL` | 900 | Seconds a sign-in link stays valid |
| `SHELVARR_SESSION_TTL` | 2592000 | Seconds a browser session lasts (30 days) |
| `SHELVARR_NATIVE_SESSION_TTL` | 31536000 | Seconds a Stackarr session lasts (1 year) |
| `SMTP_HOST` | - | Mail server for sign-in links. Without it, links are written to the server log instead |
| `SMTP_PORT` | 587 | Mail server port |
| `SMTP_SECURE` | port is 465 | Implicit TLS. Leave unset unless your server disagrees with the default |
| `SMTP_USER` | - | Username, if the mail server needs one |
| `SMTP_PASSWORD` | - | Password for `SMTP_USER` |
| `SMTP_FROM` | Shelvarr &lt;shelvarr@localhost&gt; | Address sign-in emails come from |

## Accounts

Shelvarr requires a sign-in by default. **Existing installs will be locked out
on first start after upgrading** until an admin account is created — open the
app and the first-run wizard will take you through it.

If you would rather not have accounts at all — a trusted home network, or a
reverse proxy that already authenticates — set `SHELVARR_AUTH_ENABLED=false`
and everything is open again, exactly as it was before.

**No passwords.** Signing in means entering your email and opening the link
that arrives. Links work once and expire after fifteen minutes.

**First run.** With no accounts on the server, every page redirects to
`/setup`. That wizard creates the first account, always an admin, and signs you
in on the spot — so you can get in before SMTP is configured. Once the first
account exists the wizard is closed for good.

**Adding people.** By default nobody can sign themselves up: an admin invites
them from **Settings → Users**, which creates the account and emails a link.
Turn on *Let anyone sign themselves up* there if you would rather any address
could create its own account.

**Without email.** Sign-in links can only be delivered if `SMTP_HOST` is set.
Until it is, Shelvarr writes each link to the server log and shows invite links
in **Settings → Users**, so a mail-less install is still usable — just manual.

**The app.** Stackarr signs in with the same email and link. Because a phone
cannot open its own email reliably, it shows a short code and waits: open the
link anywhere — your laptop is fine — check the code in the email matches the
one on the phone, and the app finishes signing in within a few seconds.

**API access.** The `api_key` setting still works for scripts, sent as
`X-API-Key` or as the password in basic auth. It grants access but no identity.
It is unset by default, and unlike before, leaving it unset no longer means the
API is open.

## Comics

Shelvarr manages comics itself — it does not need Kapowarr.

**Setup.** Add a ComicVine API key and at least one root folder under
**Settings → Comics**. A key is free from
[comicvine.gamespot.com/api](https://comicvine.gamespot.com/api/).

**Adding comics.** Search ComicVine from `/comics/add`. Shelvarr pulls the
volume and its issues, creates the folder, and adopts any files already sitting
there.

**Getting issues.** From a volume's page, *Search for missing issues* picks a
non-overlapping set of [GetComics](https://getcomics.org/) releases covering
what you're missing and queues them. Or run a manual search through the API to
see every release, ranked, with a reason on the ones that don't match.
Downloads stream to `GETCOMICS_DOWNLOAD_DIR`, get renamed to the naming
template, and land in the volume's folder. Supported hosts are GetComics' own
servers and Pixeldrain; DataNodes, VikingFile, TeraBox, Mega and MediaFire are
recognised and shown but not fetched — see [NOTICE.md](./NOTICE.md).

**Keeping it tidy.** Per volume: refresh metadata from ComicVine, rescan files,
and preview-then-apply a rename to the naming template. Library-wide:
`POST /api/comics/tasks` with `updateAll` or `searchAll`.

**Recurring jobs.** Under **Settings → Comics**, a nightly ComicVine metadata
refresh runs by default. The GetComics sweep — search for every missing issue
and download what it finds — is there too but starts switched off, since it
downloads things unprompted.

### Migrating from Kapowarr

If Shelvarr has been mirroring a Kapowarr library, add a root folder under
**Settings → Comics**, then press **Migrate mirrored volumes** there. Anything
that can't be migrated is listed with the reason.

The same thing headlessly:

```bash
pnpm comics:migrate --root /libraries/comics   # dry run: shows what would happen
pnpm comics:migrate --root /libraries/comics --apply
```

Either way this adopts the mirrored volumes directly. Shelvarr already has each one's
ComicVine id and full issue list cached, so it needs no ComicVine calls and
works with Kapowarr already switched off. Files are never moved — each volume
keeps the folder it is in. Add `--refresh` to queue a ComicVine metadata
refresh afterwards.

If a volume's folder can't be found, set `COMIC_PATH_MAP` to map the recorded
path prefix onto the one this process sees, e.g. `/comics-1:/libraries/comics`.
(`KAPOWARR_PATH_MAP` still works as the old name.)

For a folder tree Shelvarr has *never* seen, use **Settings → Comics → Import
an existing library** instead. That scans the tree and guesses the ComicVine
match for each folder — one search per folder, so it is slower — and you
confirm the matches on `/comics/import`.

Shelvarr no longer talks to Kapowarr at all, so once everything is migrated you
can stop and remove its container.

## Development Status

See [PLAN.md](./PLAN.md) for detailed implementation progress.

### Completed
- **Phase 1**: Foundation - Express.js, SQLite, TypeScript, Tailwind CSS
- **Phase 2**: Library management, file scanner, book listing
- **Phase 3**: Metadata fetching from Google Books and OpenLibrary
- **Phase 4**: File organization, duplicate detection, series grouping
- **Phase 5**: Komga integration

## License

[GPL-3.0-only](./LICENSE).

Shelvarr was originally MIT-licensed. It relicensed to GPL-3.0 so that the comic
acquisition subsystem could be derived from [Kapowarr](https://github.com/Casvt/Kapowarr)
(GPL-3.0). See [NOTICE.md](./NOTICE.md) for attribution details.
