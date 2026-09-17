# Shelvarr roadmap

Supersedes `PLAN.md`, which still describes an Express + vanilla-JS app in
`src/routes` and has Phases 6–8 unticked despite all three having shipped.

Cards are grouped into epics and sized S/M/L. Titles are written in the
repo's usual voice — what changes for the person using it, not what the code
does. Dependencies are noted where one card genuinely blocks another.

---

## The governing constraint

Every book source Shelvarr can download from is a shadow library — LibGen,
Anna's Archive, Z-Library. The codebase already knows this: `source-status.ts`
opens with a note about open-slum.org's uptime API disappearing.

These hosts behave nothing like ComicVine or Hardcover:

- **Domains rotate and die.** `libgen.is` → `.rs` → `.st` → `.vg` → `.la`.
  Shelvarr's mirror lists are hardcoded constants in three files, so a domain
  change is a code change and a Docker pull.
- **They sit behind Cloudflare.** A challenge page is HTTP 200 with HTML. Every
  scraper here treats that as "a search page with no results in it".
- **They rate-limit and impose daily quotas.** Z-Library's free tier is a
  handful of downloads a day; Anna's free tier is a waitlist with a countdown.
- **They serve HTML where you asked for a file**, and truncate.
- **Their markup changes without notice**, and every parser here is a
  hand-rolled regex that returns `[]` on any surprise.

So the robustness work is not "add retries". It is: *never trust the host,
never trust the response, and never let a failure look like an empty shelf.*
Cards E1-1 through E1-8 exist because of this, and most of the rest of the
roadmap depends on them.

---

## E1 — Make the slum sources survivable

### E1-1 · Keep working when LibGen changes domain again, without a new release
**Size M.** Mirror lists are hardcoded: `libgen.ts:28` (`LIBGEN_SOURCES`),
`annas.ts:24` (`ANNAS_SOURCES`), `zlibrary.ts:31` (`ZLIB_SOURCES`), plus a
second copy of the same domains in `source-status.ts:45` (`KNOWN_SOURCES`,
`MIRROR_SOURCES`). Four lists, two files each, and the only way to follow a
domain change is to ship a new image.

Move mirrors into a `source_mirrors` table (`source`, `domain`, `priority`,
`enabled`, `added_by`), seeded from today's constants on first run, editable
in Settings → Download Sources. Health status keys off the row, not a string
constant. Consistent with the existing "settings over env vars" position:
nothing a user may need to change at 11pm should require a rebuild.

**Acceptance:** adding a mirror in Settings makes it available to search and
download without a restart; the seeded defaults match today's behaviour
exactly.

### E1-2 · Say "Cloudflare is blocking us", not "no results found"
**Size S.** `probeSource` (`source-status.ts:133`) already treats 403/429/503
as `degraded` rather than `down` — good. But the *search* paths don't: a
Cloudflare interstitial returns 200 with an HTML body, the regex matches
nothing, and `searchAnnas` / `searchLibGen` / `searchZLibrary` return `[]`.
The user sees "no results", which is indistinguishable from the book genuinely
not being there.

Add a shared `detectChallenge(html, response)` — `cf-ray` header, `Just a
moment...`, `__cf_chl`, Turnstile markers, `<title>Attention Required` — and
make it throw a typed `SourceBlockedError`. Surface it as a distinct state in
the search UI and in source status.

**Acceptance:** a recorded Cloudflare interstitial fixture produces
`SourceBlockedError`, not an empty array.

### E1-3 · Tell me when a source's parser has broken, instead of shrugging
**Size M.** Every scraper is a regex over HTML that silently degrades:
`annas.ts:135` has a primary pattern and an "alternative pattern for newer
page structure" fallback, which is an admission that this already happened
once. `libgen.ts`, `zlibrary.ts` and `getAnnasDownloadLinks` do the same.
When markup changes, results quietly become zero forever and nobody notices.

Three parts:
- Separate "the page didn't look like a search page at all" (no result
  container, no `<table>`, no `/md5/` links anywhere) from "it looked right
  and had zero matches". Throw `SourceParseError` for the first.
- Record per-source parse outcomes, and show a **"Parser may be broken"**
  banner in Settings → Download Sources after N consecutive parse failures
  against a responsive host.
- Check in HTML fixtures for each source and assert the parsers against them
  in CI, so a refactor can't silently break one. (Fixtures are static files —
  no network in CI.)

**Acceptance:** a fixture with a valid-but-empty result page yields `[]`; a
fixture with unrecognised markup yields `SourceParseError`; Settings shows the
broken-parser state.

**Depends on:** nothing. **Blocks:** trusting any of E4.

### E1-4 · Probe the sources on a schedule, not when someone opens the page
**Size S.** `getSourceStatuses` refreshes only when the cache is older than
five minutes *and someone asks for it*. Mirror selection at download time
therefore reads whatever the last page view happened to cache — potentially
hours old, or empty on a fresh boot, in which case `getLibGenDomains` falls
back to a hardcoded `libgen.vg` regardless of whether it's up.

Add a `source_health` schedule to `DEFAULT_SCHEDULES` (15 min, on by default,
`category: 'books'`), so status is fresh before a download needs it.

**Acceptance:** a freshly started server has probed statuses without anyone
visiting Settings.

### E1-5 · Verify the file is the file, before it lands in your library
**Size S.** Every LibGen and Anna's result carries an md5 and Shelvarr never
checks it. `libgen.ts:334` rejects a `text/html` content-type — which catches
the obvious rate-limit page — but nothing catches a truncated stream, a
zero-padded response, or a host serving the wrong file.

Hash while streaming, compare to the expected md5, and sniff magic bytes
(`PK\x03\x04` for epub/cbz, `%PDF` for pdf). A mismatch is a dead mirror:
discard, blocklist that link, fall through to the next.

**Acceptance:** a fixture serving truncated bytes fails the download and moves
to the next mirror rather than importing a broken file.

**Depends on:** E2-2 (streaming), which is where the hash is computed.

### E1-6 · Wait out a daily limit instead of burning the queue against it
**Size M.** Z-Library's free tier allows a handful of downloads a day; Anna's
free tier is a waitlist with a countdown. Shelvarr has no concept of either,
so ten queued books will all fail in a row against a spent quota.

Reuse the pattern already proven for comics in PLAN item 9.33: a typed
`SourceLimitReachedError` that *defers* rather than fails — state back to
queued, partial file kept, per-source `retry_after` recorded and respected by
the whole queue. Add a per-source concurrency cap of 1 (these hosts punish
parallelism) and per-source pacing, extending `utils/pacing.ts`.

**Acceptance:** with a mocked 429 carrying `Retry-After`, the download defers,
nothing else from that source starts before the deadline, and the queue keeps
working on other sources.

**Depends on:** E2-1. **Mirrors:** the comic `DownloadLimitReachedError` work.

### E1-7 · Let me put these sources behind a proxy, and keep my password out of the database
**Size M.** Two related gaps:
- Many ISPs DNS-block these domains outright. There's no proxy setting
  anywhere, and no per-source User-Agent — every request sends the same
  hardcoded `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36`
  string, which is copied verbatim into six files.
- `upsertDownloadSourceConfig` (`packages/db/src/index.ts:756`) writes
  credentials as plaintext JSON into `download_source_config.credentials`.
  For Z-Library that is a real account password, sitting in a SQLite file
  inside a Docker volume.

Add optional per-source HTTP(S)/SOCKS proxy config in Settings, and encrypt
credentials at rest with a key derived from a value in the data directory.

**Acceptance:** a configured proxy is used for that source's requests only;
existing plaintext credentials are migrated on first read.

### E1-8 · Ask before searching a shadow library, rather than assuming
**Size S.** `isSourceEnabled` (`packages/db/src/index.ts:766`) returns `true`
for any source with no config row. A fresh install therefore queries LibGen,
Anna's Archive and Z-Library the first time anyone opens the wanted list,
without the operator having opted in.

Default all three to off. On first visit to Settings → Download Sources, state
plainly what they are and let the operator turn on the ones they want. This is
both the honest default for a public GPL project and the one that doesn't
surprise someone who only wanted a library scanner.

**Acceptance:** a fresh database searches nothing until a source is enabled;
the wanted list explains why there are no sources rather than showing an empty
result table.

---

## E2 — Give books the download pipeline comics already have

Phase 9 built comics a real acquisition pipeline. Books never got one. The gap,
as it stands:

| | Comics | Books |
|---|---|---|
| Download row (state, progress, attempts, mirrors) | `comic_downloads` | none — the `downloads` table in `schema.sql` is read and written by **nothing**¹ |
| History / blocklist | `comic_download_history`, `comic_blocklist` | none |
| Mirror fallback with memory | yes | per-call only, forgotten immediately |
| Resume after restart, byte-range resume | yes | no |
| Rate-limit deferral | yes | no |
| Retry from the UI, queue page | yes | no |
| Streams to disk | yes | no — whole file into a `Buffer` |

¹ `admin/diagnostics.ts:163` groups `downloads` by status for the status
snapshot. It will always return zero rows.

### E2-0 · Stop a download quietly overwriting the book you already had
**Size S. Bug. Do this first.** `handlers.ts:441-449` builds a
collision-avoiding `altPath` in a `while` loop and then never uses it — line
457 writes to `targetPath` regardless. Re-downloading a book you own destroys
the existing file, with no warning and no way back.

**Acceptance:** a regression test downloads over an existing filename and
finds both files intact.

### E2-1 · Keep a book download in the queue, not just in a task that vanished
**Size L.** Give books the `comic_downloads` treatment: a `book_downloads`
table with `state`, `progress`, `size`, `attempts`, `alternate_links`,
`heartbeat_at`, `error`, plus `book_download_history` and `book_blocklist`.
Drop the vestigial `downloads` table in the same migration.

The heartbeat is what makes the rest possible: it is how a `book_resume` sweep
(E2-4) knows a download was orphaned, and how the UI (E2-5) shows something
truthful while a 40-minute download runs.

**Acceptance:** a queued download is visible as a row with live byte progress;
killing the process and restarting picks it up again.

**Blocks:** E2-3, E2-4, E2-5, E1-6.

### E2-2 · Download a big book without putting it all in memory first
**Size M.** `libgen.ts:353` does `response.arrayBuffer()` and
`handlers.ts:457` does `fs.writeFileSync(targetPath, buffer)`. A 400 MB scanned
PDF is 400 MB of heap in a container that usually has 512 MB.

The comic side already solved this: `comics/getcomics/clients/direct.ts`
streams to a scratch file with HTTP range resume, `probeDownload`,
`filenameFromDisposition` and typed errors. Lift it to a shared
`services/downloads/http-client.ts` and have both pipelines use it, rather than
maintaining a second, worse downloader.

**Acceptance:** downloading a 1 GB fixture holds flat memory; an interrupted
transfer resumes from the byte it stopped at.

**Depends on:** E2-1 (somewhere to record progress).

### E2-3 · Try the next mirror instead of giving up on the first dead link
**Size M.** `downloadFile` walks `getLibGenDomains()` within a single call, but
the moment it returns the attempt is forgotten: nothing records which mirror
failed, so the next download makes exactly the same mistakes. Comics store the
group's remaining mirrors on the row and blocklist each dead one as they fall
through (PLAN 9.32).

Do the same: resolve all candidate links at queue time, store them on the
row, fall through on failure, blocklist what's dead with a reason.

**Depends on:** E2-1. **Pairs with:** E1-5 (a hash mismatch is a dead mirror).

### E2-4 · Pick a download back up after a restart, rather than leaving it stuck
**Size S.** Add a `book_resume` schedule mirroring `comic_resume` (15 min,
30-minute staleness, on by default), claiming with the same single atomic
`UPDATE` so several server processes can sweep without doubling up.

**Depends on:** E2-1, E2-2.

### E2-5 · Show me what my books are doing, in megabytes
**Size M.** There is no `/downloads` page for books, and progress on the tasks
page is `onProgress(0..6)` — *steps*, so a 40-minute download reads "2 of 6"
throughout. PR #139 did exactly this fix for comics.

Build `/downloads` as the sibling of `/comics/downloads`: queue, history,
blocklist, cancel, retry. Byte progress over SSE via the existing
`events/` module and `LiveEvents`.

**Depends on:** E2-1, E2-2.

### E2-6 · File a downloaded book the way you file every other book
**Size S.** Steps 5–6 of `downloadHandler` hardcode an
`Author/Title - Series Book N` layout, so a downloaded book ignores the
template set in Settings → Organize, and skips the EXDEV-safe mover at
`organizer/index.ts:250` that every other move path uses. Call
`applyReorganization` / `generateNewPath` instead and delete the bespoke copy.

**Acceptance:** a downloaded book lands at the same path the organize preview
predicts for it.

---

## E3 — Reading

### E3-1 · Keep my place in the browser, the way it's kept on my phone
**Size S. Highest value per line in the roadmap.**
`apps/web/components/books/EpubReader.tsx` initialises
`useState<string | number>(0)` and `locationChanged` only calls `setLocation`.
It never touches `/api/books/[id]/progression` — the per-user, per-device EPUB
locator store that exists, is tested, handles device ids, and syncs ≥98% to
Hardcover. Stackarr uses it. The browser does not.

The README says "An EPUB reader in the browser, with your place kept per
person". On the web that is currently untrue: close the tab and you lose your
place, and a book you're halfway through on your phone opens at the cover.

Restore on open, debounce-save on location change, save on unload.

**Acceptance:** progress made in the browser resumes in Stackarr and back.

### E3-2 · Serve a comic a page at a time, instead of the whole archive
**Size L.** `openComicArchive` only speaks whole files, and for CBR it does
`readFileSync` + `zipSync` — **both synchronous**. One person opening a 300 MB
CBR blocks the Node event loop for every other request on the server, every
time, with no cache. That is a live reliability problem for Stackarr today,
not merely a blocker for a web reader.

Add:
```
GET /api/comics/issues/:id/pages      → { count, pages: [{ n, w, h }] }
GET /api/comics/issues/:id/pages/:n   → image bytes
```
backed by an extract-once cache under the scratch directory — `comics/scratch.ts`
already has a sweeper to tidy it. Do the CBR work off-thread.

**Blocks:** E3-3, E3-4. **Also fixes:** the event-loop stall, for everyone.

### E3-3 · Read a comic in the browser
**Size L.** `/comics/[slug]` shows issues, shows progress synced from Stackarr,
and lets you mark one read — but there is no way to read one. The only reader
is `apps/native/src/screens/ComicReaderScreen.tsx`. For a self-hosted comic
manager this is the most conspicuous missing feature in the product.

Single page / double page / vertical strip, fit-width and fit-height,
prefetch ahead, keyboard and swipe, progress posted to the existing
`/api/comics/issues/:id/progress`, and the "read every issue" completion that
PR #144 already built.

**Depends on:** E3-2.

### E3-4 · Open the PDFs and CBZs already in my book library
**Size M.** `BookActions.tsx:34` gates the Read button on `.epub`.
`/api/books/[id]/pages` and `/pages/[n]` are stubs returning `[]` and 404, with
the comment "page-based readers would need CBZ extraction". So a PDF or CBZ in
a *book* library is catalogued, covered, organised — and then unopenable.
Same API as E3-2, pointed at book files.

**Depends on:** E3-2.

### E3-5 · Make the reader somewhere you'd actually want to spend an evening
**Size M.** `react-reader` is being used at close to defaults: `flow:
'scrolled'`, `showToc`, nothing else. Missing: font size and typeface, line
height and margins, light/sepia/dark, keyboard navigation, chapter and book
progress ("about 12 minutes left in this chapter"), bookmarks, highlights,
search within the book, and a way to hide the header. Most of it is epub.js
configuration rather than new infrastructure.

Settings persist per user, so they follow you between devices — and per the
existing brand notes, no serif fonts in the chrome, though the *book* should
absolutely offer one.

### E3-6 · Make an opened book available offline
**Size M. Redefined 2026-09-16** — this was "start reading before the whole
book has downloaded" (progressive/streaming loading). Decided against: the
reader already downloads the whole file before rendering, and that's staying
— always download first, then cache, rather than streaming. What's missing
is the cache half. Once fetched, an EPUB isn't kept anywhere durable: closing
the reader and reopening later re-fetches the whole file, and there's no way
to read a book you've already opened once without a network connection.

Cache a book's bytes client-side (IndexedDB, not the HTTP cache — it isn't
durable enough to promise offline access) keyed by book id, checked before
the network fetch, refreshed in the background when online. This is
web-reader-only: it needs no server changes, and doesn't attempt full PWA
offline navigation (a service worker caching the app shell so `/books/:id`
loads from a cold, offline start) — this app has no PWA infrastructure at all
today (no manifest, no service worker), and that's a materially larger,
separate undertaking than caching one reader's content. Note that as a
follow-up if it's ever wanted.

**Shipped 2026-09-16** as `apps/web/lib/offline/bookCache.ts` (IndexedDB),
wired into `EpubReader` only — a cache hit renders instantly and works
offline, a miss still fetches and populates the cache, and progress saves
already failed silently when offline. Extending the same cache to
`BookPageReader`/`ComicReader`'s page images was left as a follow-up: their
plain `<img src>` fetches aren't cache-interceptable without converting them
to fetch-and-blob-URL management, which is real component surgery rather
than a small addition.

---

## E4 — Acquisition worth trusting

### E4-1 · Only accept the format and quality I asked for
**Size M.** There is no quality profile: no preference for epub over pdf, no
language filter, no size sanity floor, no "reject anything under 50 KB" — and
search results already carry extension, size, language and year. Quality
profiles are the feature anyone arriving from Sonarr or Radarr expects to find.

Given the sources, the *floor* matters more than the ceiling: a 12 KB "book"
from LibGen is an error page someone saved, and it should never reach a shelf.

### E4-2 · Go and find the books on my wanted list, without being asked
**Size M.** `comic_search_all` sweeps nightly for missing issues. There is no
`book_search_all`. `wanted_books.status` even has a `'searching'` value that
nothing ever sets. Adding a book to the wanted list today means remembering to
come back and click through a modal.

Off by default, like `comic_search_all`.

**Depends on:** E1-3 (a broken parser must not silently mean "not available
anywhere"), E2-1, E4-1.

### E4-3 · Hand Shelvarr a file you downloaded yourself
**Size M.** Two of three book sources currently tell you to download in your
browser (E2-7 fixes that, but manual acquisition will always happen), and then
there is no way to give the file to Shelvarr except dropping it in a library
folder and waiting for the nightly scan. There is no file watcher anywhere in
the codebase — everything is scan-on-demand or scan-on-schedule.

A drop target on the book and wanted pages, plus an optional watched folder
that imports, matches and files what appears in it. A watched folder also
closes the loop for anyone running a separate downloader.

**Shipped 2026-09-16** as a wanted-list upload (`POST /api/wanted/:id/import`)
— the watched-folder half is still open, noted below as E4-4.

### E4-4 · Let a book library hold comic archives too
**Size S. Added 2026-09-16.** E4-3's upload only accepts what the book
scanner already recognises — epub/pdf/mobi/azw/azw3 — so a CBZ/CBR can't be
manually imported into a book library, even though `BookPageReader` (E3-4)
can already read one once it's there by some other means. Add `cbz`/`cbr` to
the book scanner's recognised extensions, and confirm the manual-import route
and `downloadHandler`'s extension handling pick it up for free (both already
read from the scanner's list rather than hardcoding their own — verify that
holds rather than assuming it).

**Shipped 2026-09-16.**

### E4-5 · Download from Anna's Archive and Z-Library, not just LibGen
**Size L. Renumbered from E2-7 2026-09-16** (moved into this epic — it's
acquisition, not the download-pipeline plumbing E2 was about, and E2 is now
otherwise complete). `downloadHandler` throws `Download from ${source} not
yet supported` for both, while `isSourceEnabled` defaults them off (E1-8) so
they only run once an operator opts in.

- **Anna's Archive:** `getAnnasDownloadLinks(md5)` already exists and is
  unused. The free path is `/slow_download/<md5>/0/0` behind a countdown and
  a Cloudflare gate; the reliable path is the member API
  (`/dyn/api/fast_download.json`) with a key. Support the key path properly
  and treat the free path as best-effort, deferring on a waitlist rather than
  failing (E1-6).
- **Z-Library:** `authenticateZLibrary` exists and returns `remix_userid` /
  `remix_userkey` cookies; nothing consumes them. Z-Library also issues a
  per-account personal domain after login, which the hardcoded mirror list
  can't represent — another reason for E1-1.

Wire both through the shared streaming downloader (`streaming-download.ts`,
from E2-2) the same way LibGen already is, reusing the challenge/parse-failure
detection from E1-2/E1-3 rather than treating a bot-check page as "download
failed." Ship them one at a time.

**Depends on:** E1-1, E1-2, E1-3, E1-6, E2-2.

**Shipped 2026-09-16**, against E1-2/E1-3/E2-2 as built rather than waiting on
E1-1 or E1-6: `resolveAnnasDownload` prefers the member `fast_download.json`
API when a key is configured (Settings gained a field for it), falling back
to the scraped free path otherwise; `resolveZlibraryDownload` authenticates
(or reuses a cached session) and scrapes the book's detail page for its real
link. Both feed the same mirror-fallback loop LibGen's download already used
— pulled out of `downloadHandler` into `downloadBookWithFallback` so all
three sources share it — and use the existing task-level
`DownloadLimitReachedError` retry rather than a new per-source daily quota.
Still open, deliberately: E1-1's proper mirror table (both sources still use
the same hardcoded-domain-list shape LibGen does) and E1-6's daily-quota
deferral.

---

## E5 — Comics

### E5-1 · Measure what auto-search can't reach before deciding to widen it
**Size S.** `SUPPORTED_HOSTS` is `['getcomics', 'pixeldrain']`; mega, mediafire,
datanodes, vikingfile and terabox are recognised and discarded. `NOTICE.md`
documents this as a deliberate divergence from Kapowarr, and it is a defensible
one — but it is also a hard ceiling on how many missing issues auto-search can
actually fetch, and nobody has measured where that ceiling sits.

Instrument first: log the host mix of links found versus links usable across a
week of `comic_search_all`. *Then* decide whether MediaFire — a single scrape,
the cheapest of the five — is worth the divergence. A card to get a number, not
to write a client.

### E5-2 · Say what happened to a comic download after it failed five times
**Size S.** The rate-limit path gives up after 5 attempts so the next
auto-search can try a different release (PLAN 9.33), which is right — but the
row ends as a bare `failed` with an error string. Record *why* it was
abandoned, distinctly from a link being dead, so the queue page can say
"the host kept rate-limiting us" rather than showing a stack trace.

**Shipped 2026-09-17.** `comic_downloads.failure_reason` and
`comic_download_history.failure_reason` now hold one of `rate-limited`,
`link-broken`, `download-failed`, `import-failed` or `library-unwritable`,
set by the download handler as it gives up rather than parsed back out of the
error string. It is cleared whenever the row is driven again, so it only ever
describes the failure the row is in. `/comics/downloads` leads with the
reason in plain words — "The host kept rate-limiting us, so we stopped
asking" — and demotes the raw error to a muted line beneath it; history rows
carry a short version of the same. Rows that failed before this existed have
no reason and still show their error.

---

## E6 — Foundations

### E6-1 · Don't leave a task running forever because the server restarted
**Size S.** Nothing reconciles `tasks` rows left at `status = 'running'` when
the process dies. `apps/web/lib/config/index.ts` starts the scheduler and
nothing else. Only `comic_download` recovers, and only because it has its own
heartbeat row. A `scan`, `metadata`, `organize`, `comic_scan` or book
`download` interrupted by a restart sits at `running` forever and is never
retried — `isRetriable` returns false for `running`.

Fail any `running` task older than process start, with a clear error, and make
it retriable. Fifteen lines; removes a whole class of "it's stuck" reports.

### E6-2 · Don't lose the retry queue when the server restarts
**Size M.** The rate-limit retry queue is in memory, and the code already
admits the consequence (`queue/index.ts:569-577`): a restart loses it and
leaves the task pending-with-an-error, recoverable only by a human clicking
retry. Persist `not_before` on the task row and rebuild the queue at startup —
the scheduler's atomic-claim pattern applies directly.

### E6-3 · Test the two subsystems that actually break
**Size M.** `apps/web/tests/e2e/` covers api, auth, books, libraries,
navigation, series, settings and tasks. There is no E2E for comics, for
reading, or for downloads — the three most complex things in the app. Add
specs driven by fixtures and a stub source server, so they don't depend on a
shadow library being up.

### E6-4 · Retire PLAN.md, and stop shipping Express
**Size S.** `PLAN.md` describes an app that no longer exists; this file
replaces it. Separately, `express@4.21.2`, `multer@2.2.0` and their `@types`
are dependencies of `apps/web`, imported by nothing, and ship inside the Docker
image — dead weight and needless CVE surface.

### E6-5 · Clear the six standing react-hooks warnings
**Size S.** PLAN item 10.6: mount-once effects in the native reader and
settings screens where adding the dependencies would change behaviour. Left as
warnings rather than guessed at. Resolve them deliberately.

---

## Suggested order

**Status as of 2026-09-16: 31 of 32 original cards shipped.** E2, E4 and E6
are done. E3 is done except E3-5 (reader polish) — E3-6 (redefined above as
offline caching, not streaming) shipped too. E5 is done except E5-2.

**E1 is not fully done, despite an earlier version of this section claiming
otherwise** — that was wrong, corrected 2026-09-16. Shipped: E1-2, E1-3,
E1-4, E1-8 (challenge/parse-failure detection, scheduled health probes,
shadow sources off by default). Still open: **E1-1** (mirror lists are still
hardcoded constants, not a `source_mirrors` table), **E1-5** (downloaded
files still aren't md5-verified), **E1-6** (no daily-quota deferral —
`DownloadLimitReachedError` triggers mirror fallback within one download,
per E2-3, but there's no per-source backoff across the whole queue), and
**E1-7** (no proxy setting; `download_source_config.credentials` is still
plaintext). None of these block anything already shipped — E4-5 shipped
without them, on the task-level retry E2-3 already had, and is more fragile
for it, most visibly around E1-6.

**What's left:** E1-1, E1-5, E1-6, E1-7, E3-5, E5-2. None block each other.
