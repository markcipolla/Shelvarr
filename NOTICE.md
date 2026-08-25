# Notices and attributions

Shelvarr is licensed under the [GNU General Public License v3.0 only](./LICENSE).

## Relicensing from MIT

Shelvarr was originally distributed under the MIT licence. As of the comic
acquisition work it is distributed under GPL-3.0-only.

The reason is derivation: the comic sourcing subsystem
(`packages/services/src/comics/getcomics/`) is a TypeScript derivative of
[Kapowarr](https://github.com/Casvt/Kapowarr) by Casvt, which is GPL-3.0.
Specifically, the following are ports or close adaptations of Kapowarr v1.3.1
(commit `55946aa`):

| Shelvarr | Derived from Kapowarr |
|---|---|
| `comics/getcomics/parse.ts` | `backend/base/file_extraction.py` (`extract_filename_data`, `extract_issue_number`, `extract_volume_number`, `refine_special_version`) |
| `comics/getcomics/match.ts` | `backend/implementations/matching.py` (`match_title`, `match_year`, `match_volume_number`, `match_special_version`, `check_search_result_match`, `download_group_filter`) |
| `comics/getcomics/rank.ts` | `backend/features/search.py` (`_rank_search_result`) |
| `comics/getcomics/groups.ts` | `backend/implementations/getcomics.py` (`_get_download_groups`, `__extract_button_links`, `__extract_list_links`) |
| `comics/getcomics/paths.ts` | `backend/implementations/getcomics.py` (`_create_link_paths`, `__sort_link_paths`) |
| `comics/getcomics/search.ts` | `backend/features/search.py` (`QUERY_FORMATS`, `manual_search`, `auto_search`) — the transport differs (WordPress REST API rather than HTML scraping) |
| `comics/comicvine/index.ts` | `backend/implementations/comicvine.py` (field lists, `fetch_volume`, `fetch_issues`, `search_volumes`, `_clean_description`, rate-limit pacing) |
| `comics/scan.ts` | `backend/implementations/file_matching.py` (`scan_files`) and `backend/implementations/matching.py` (`file_importing_filter`) |
| `comics/library.ts` | `backend/implementations/volumes.py` (volume add / refresh / delete) |
| `comics/rename.ts` | `backend/implementations/naming.py` (`preview_mass_rename`, `mass_rename`, `same_name_indexing`) |
| `comics/import-library.ts` | `backend/features/library_import.py` |
| `comics/naming.ts` | `backend/implementations/naming.py` and the naming defaults in `backend/internals/settings.py` |
| `comics/import.ts` | `backend/features/post_processing.py` (move/rename on completion) |
| `comics/adopt.ts` | No direct upstream equivalent — Kapowarr has nothing to migrate *from* |
| `queue/scheduler.ts` | `backend/features/tasks.py` (`task_intervals`, `handle_intervals`) |

Everything else in Shelvarr is original work, but because the project ships as a
single combined program the GPL applies to the whole of it.

Shelvarr no longer integrates with Kapowarr in any way — it manages comics
itself end to end. The attribution above stands regardless: the code listed is
still derived from Kapowarr's, and the GPL obligation does not lapse when the
integration does.

Kapowarr's copyright notice is retained in [LICENSE](./LICENSE)'s accompanying
terms; the original project remains available at
<https://github.com/Casvt/Kapowarr>.

## Upstream differences worth knowing

Shelvarr's port deliberately diverges from Kapowarr in a few places:

- **Search transport.** Kapowarr scrapes up to 10 GetComics HTML search pages and
  then fetches each article page separately. Shelvarr uses the site's open
  WordPress REST API (`/wp-json/wp/v2/posts?search=`), which returns the article
  body (`content.rendered`) inline — one paginated JSON call instead of N+1 HTML
  fetches.
- **Download hosts.** Kapowarr recognises Mega, MediaFire, WeTransfer, Pixeldrain,
  GetComics-direct and torrents. Shelvarr *downloads* from GetComics-direct and
  Pixeldrain only — both resolve to plain range-capable HTTP responses. It
  *recognises* DataNodes, VikingFile, TeraBox, Mega and MediaFire so their links
  show up in manual search, but does not fetch from them: each needs a
  landing-page interaction or a service-specific API that GetComics-direct
  and Pixeldrain make unnecessary in practice.
- **No format conversion.** Kapowarr converts between cbz/cbr/zip/rar/folder using
  external `unrar`/`rar` binaries. Shelvarr stores what it downloads; its reader
  already transcodes CBR to CBZ on the fly (`comics/archive.ts`).
- **Issue identity.** Kapowarr keys issues on ComicVine ids alone. Shelvarr keeps
  its own local issue ids stable across metadata refreshes (matching on the
  ComicVine id underneath), because read progress and the native app's cache
  reference them. Issues withdrawn upstream are tombstoned rather than deleted
  for the same reason.
- **No torrent or Usenet clients, no FlareSolverr, no websockets.** Task
  progress rides on Shelvarr's existing job queue.
- **Scheduling claims in the database.** Kapowarr's `TaskHandler` is a
  process-local singleton. Next.js can run several server processes against
  one SQLite file, so Shelvarr claims a due job with a single atomic
  `UPDATE … WHERE next_run <= ? RETURNING …` instead — two processes ticking
  at the same instant cannot both take the same job.
