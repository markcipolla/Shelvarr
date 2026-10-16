'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  queueComicReleaseAction,
  searchComicReleasesAction,
  type ComicReleaseView,
} from '@/lib/actions/comics';

interface ReleaseSearchPanelProps {
  volumeId: number;
  /** Scope the search to one issue; omit for the whole volume. */
  issueId?: number | null;
  /** Shown above the box so it's clear what is being searched for. */
  subject: string;
  onClose?: () => void;
}

const buttonClass =
  'px-3 py-1.5 text-sm rounded-lg border border-shelvarr-border text-white hover:border-blue-500 disabled:opacity-50';

/**
 * Manual release search: what GetComics actually has, and what Shelvarr made
 * of it.
 *
 * The auto-search picks for you and reports a number. When that number is
 * zero there is no way to tell a dead site from a query that missed from a
 * matcher that rejected five perfectly good releases over a year it couldn't
 * parse. This panel shows all three, and lets the query be rewritten and a
 * rejected release be taken anyway.
 */
export function ReleaseSearchPanel({
  volumeId,
  issueId = null,
  subject,
  onClose,
}: ReleaseSearchPanelProps) {
  const router = useRouter();

  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [grabbing, setGrabbing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [results, setResults] = useState<ComicReleaseView[] | null>(null);
  const [queries, setQueries] = useState<string[]>([]);

  const runSearch = useCallback(
    async (override: string | null) => {
      setSearching(true);
      setError(null);
      setMessage(null);

      const result = await searchComicReleasesAction(volumeId, {
        issueId,
        query: override,
      });

      if (result.error) {
        setError(result.error);
        setResults(null);
      } else {
        setResults(result.results);
      }
      setQueries(result.queries);
      setSearching(false);
    },
    [volumeId, issueId]
  );

  // Open with the generated search already run: the common case is that it
  // works, and the box is only needed when it doesn't.
  useEffect(() => {
    void runSearch(null);
  }, [runSearch]);

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    void runSearch(query.trim() || null);
  };

  const handleGrab = async (release: ComicReleaseView) => {
    setGrabbing(release.link);
    setError(null);
    setMessage(null);

    const result = await queueComicReleaseAction(volumeId, release.link, {
      issueId,
      // A rejected release is only taken because someone looked at it and
      // decided the matcher was wrong, so skip the filter that rejected it.
      // Picking by hand also clears the release's blocklist entries — see
      // queueComicReleaseAction.
      forceMatch: !release.match,
    });

    if (result.success) {
      setMessage(
        result.queued === 0
          ? 'Nothing on that page could be queued — its links are all dead or unsupported.'
          : `Queued ${result.queued} download${result.queued === 1 ? '' : 's'}.`
      );
      router.refresh();
    } else {
      setError(result.error ?? 'Failed to queue the download');
    }

    setGrabbing(null);
  };

  const matched = results?.filter((result) => result.match).length ?? 0;

  return (
    <div className="bg-shelvarr-surface border border-shelvarr-border rounded-lg p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm text-white">
          Releases on GetComics for <span className="font-medium">{subject}</span>.
        </p>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="text-sm text-shelvarr-text-muted hover:text-white flex-shrink-0"
          >
            Close
          </button>
        )}
      </div>

      <form onSubmit={handleSubmit} className="flex gap-2">
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={queries[0] ?? 'Search GetComics…'}
          className="flex-1 bg-shelvarr-bg border border-shelvarr-border rounded-lg px-3 py-1.5 text-sm text-white placeholder-shelvarr-text-muted focus:outline-none focus:border-blue-500"
        />
        <button
          type="submit"
          disabled={searching}
          className="px-3 py-1.5 text-sm rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-medium"
        >
          {searching ? 'Searching…' : 'Search'}
        </button>
        {query && (
          <button
            type="button"
            onClick={() => {
              setQuery('');
              void runSearch(null);
            }}
            disabled={searching}
            className={buttonClass}
          >
            Reset
          </button>
        )}
      </form>

      {queries.length > 0 && (
        <p className="text-xs text-shelvarr-text-muted">
          Searched for: {queries.map((q) => `“${q}”`).join(', ')}
        </p>
      )}

      {message && <p className="text-sm text-green-400">{message}</p>}
      {error && <p className="text-sm text-red-400">{error}</p>}

      {results !== null && !searching && (
        <ResultSummary total={results.length} matched={matched} queries={queries} />
      )}

      {results !== null && results.length > 0 && (
        <ul className="divide-y divide-shelvarr-border max-h-96 overflow-y-auto">
          {results.map((release) => (
            <li key={release.link} className="flex items-start gap-3 py-2">
              <div className="flex-1 min-w-0">
                <a
                  href={release.link}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="text-sm text-white hover:text-blue-400 break-words"
                >
                  {release.displayTitle}
                </a>
                <p className="text-xs mt-1">
                  {release.match ? (
                    <span className="text-green-400">Matches this volume</span>
                  ) : (
                    <span className="text-amber-400">
                      Skipped: {release.matchIssue ?? 'no reason given'}
                    </span>
                  )}
                  {release.issueNumber && (
                    <span className="text-shelvarr-text-muted"> · #{release.issueNumber}</span>
                  )}
                  {release.year && (
                    <span className="text-shelvarr-text-muted"> · {release.year}</span>
                  )}
                </p>
              </div>
              <button
                type="button"
                onClick={() => handleGrab(release)}
                disabled={grabbing !== null}
                className={`${buttonClass} flex-shrink-0`}
              >
                {grabbing === release.link
                  ? 'Queueing…'
                  : release.match
                    ? 'Download'
                    : 'Download anyway'}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * The indicator for an empty search. Three different nothings, and which one
 * it is decides what to do next — so say which.
 */
function ResultSummary({
  total,
  matched,
  queries,
}: {
  total: number;
  matched: number;
  queries: string[];
}) {
  if (total === 0 && queries.length === 0) {
    return (
      <p className="text-sm text-shelvarr-text-muted">
        Nothing was searched for: every issue of this volume is either unmonitored or
        already on disk.
      </p>
    );
  }

  if (total === 0) {
    return (
      <p className="text-sm text-shelvarr-text-muted">
        GetComics returned 0 results. Try a shorter query — the series name on its own
        usually works.
      </p>
    );
  }

  if (matched === 0) {
    return (
      <p className="text-sm text-amber-400">
        {total} release{total === 1 ? '' : 's'} found, but none matched this volume. The
        reason is on each one below; &ldquo;Download anyway&rdquo; overrules it, and
        clears the release&rsquo;s blocklist entries on the way through.
      </p>
    );
  }

  return (
    <p className="text-sm text-shelvarr-text-muted">
      {total} release{total === 1 ? '' : 's'} found, {matched} matching this volume.
    </p>
  );
}
