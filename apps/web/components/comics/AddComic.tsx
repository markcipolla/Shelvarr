'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  addComicVolumeAction,
  searchComicVineAction,
  type ComicVineSearchResultView,
} from '@/lib/actions/comics';

interface RootFolder {
  id: number;
  path: string;
}

/** Strip the HTML ComicVine returns in descriptions, for a one-line summary. */
function summarise(html: string, limit = 220): string {
  const text = html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  return text.length > limit ? `${text.slice(0, limit).trimEnd()}…` : text;
}

export function AddComic({ rootFolders }: { rootFolders: RootFolder[] }) {
  const router = useRouter();

  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);
  const [results, setResults] = useState<ComicVineSearchResultView[]>([]);
  const [configured, setConfigured] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [rootFolderId, setRootFolderId] = useState(rootFolders[0]?.id);
  const [adding, setAdding] = useState<number | null>(null);
  const [addError, setAddError] = useState<string | null>(null);

  const handleSearch = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!query.trim()) return;

    setSearching(true);
    setError(null);
    setAddError(null);

    const result = await searchComicVineAction(query.trim());
    setConfigured(result.configured);
    setResults(result.results);
    setError(result.error ?? null);
    setSearched(true);
    setSearching(false);
  };

  const handleAdd = async (comicvineId: number) => {
    setAdding(comicvineId);
    setAddError(null);

    const result = await addComicVolumeAction(comicvineId, rootFolderId);
    if (result.success && result.volumeId) {
      router.push(`/comics/${result.slug ?? result.volumeId}`);
      return;
    }
    setAddError(result.error ?? 'Failed to add volume');
    setAdding(null);
  };

  if (!configured) {
    return (
      <div className="bg-shelvarr-surface border border-shelvarr-border rounded-lg p-8 text-center">
        <p className="text-shelvarr-text-muted">
          Comic metadata needs a ComicVine API key.{' '}
          <Link href="/settings/comics" className="text-shelvarr-primary hover:underline">
            Add one in settings
          </Link>
          .
        </p>
      </div>
    );
  }

  if (rootFolders.length === 0) {
    return (
      <div className="bg-shelvarr-surface border border-shelvarr-border rounded-lg p-8 text-center">
        <p className="text-shelvarr-text-muted">
          Comics need somewhere to live.{' '}
          <Link href="/settings/comics" className="text-shelvarr-primary hover:underline">
            Add a root folder
          </Link>{' '}
          first.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <form onSubmit={handleSearch} className="flex gap-2">
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search ComicVine — series name, or a 4050-… id"
          className="flex-1 bg-shelvarr-surface border border-shelvarr-border rounded-lg px-3 py-2 text-white placeholder-shelvarr-text-muted focus:outline-none focus:border-blue-500"
        />
        <button
          type="submit"
          disabled={searching || !query.trim()}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-lg text-sm font-medium"
        >
          {searching ? 'Searching…' : 'Search'}
        </button>
      </form>

      {rootFolders.length > 1 && (
        <div className="flex items-center gap-2 text-sm">
          <label htmlFor="root-folder" className="text-shelvarr-text-muted">
            Add to
          </label>
          <select
            id="root-folder"
            value={rootFolderId}
            onChange={(event) => setRootFolderId(Number(event.target.value))}
            className="bg-shelvarr-surface border border-shelvarr-border rounded-lg px-3 py-1.5 text-white"
          >
            {rootFolders.map((folder) => (
              <option key={folder.id} value={folder.id}>
                {folder.path}
              </option>
            ))}
          </select>
        </div>
      )}

      {error && (
        <div className="bg-red-600/20 text-red-400 border border-red-500/40 rounded-lg p-4">
          {error}
        </div>
      )}
      {addError && (
        <div className="bg-red-600/20 text-red-400 border border-red-500/40 rounded-lg p-4">
          {addError}
        </div>
      )}

      {searched && results.length === 0 && !error && (
        <p className="text-shelvarr-text-muted">Nothing on ComicVine matched that.</p>
      )}

      <ul className="space-y-3">
        {results.map((result) => (
          <li
            key={result.comicvineId}
            className="flex gap-4 bg-shelvarr-surface border border-shelvarr-border rounded-lg p-4"
          >
            <div className="w-20 flex-shrink-0">
              {result.coverLink ? (
                // ComicVine's own CDN; there is no local copy until the volume
                // is added, so this is a plain <img> rather than next/image.
                <img
                  src={result.coverLink}
                  alt=""
                  className="w-20 rounded border border-shelvarr-border"
                />
              ) : (
                <div className="w-20 aspect-[2/3] rounded bg-shelvarr-bg border border-shelvarr-border" />
              )}
            </div>

            <div className="flex-1 min-w-0">
              <h3 className="text-white font-medium">
                {result.title}
                {result.year ? ` (${result.year})` : ''}
              </h3>
              <p className="text-xs text-shelvarr-text-muted mt-0.5">
                {[
                  result.publisher,
                  `Volume ${result.volumeNumber}`,
                  `${result.issueCount} issue${result.issueCount === 1 ? '' : 's'}`,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </p>
              {result.description && (
                <p className="text-sm text-shelvarr-text-muted mt-2">
                  {summarise(result.description)}
                </p>
              )}
            </div>

            <div className="flex-shrink-0 self-center">
              {result.alreadyAdded !== null ? (
                <Link
                  href={`/comics/${result.alreadyAddedSlug ?? result.alreadyAdded}`}
                  className="px-3 py-1.5 text-sm rounded-lg border border-shelvarr-border text-shelvarr-text-muted hover:text-white hover:border-blue-500"
                >
                  In library
                </Link>
              ) : (
                <button
                  type="button"
                  onClick={() => handleAdd(result.comicvineId)}
                  disabled={adding !== null}
                  className="px-3 py-1.5 text-sm rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-medium"
                >
                  {adding === result.comicvineId ? 'Adding…' : 'Add'}
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
