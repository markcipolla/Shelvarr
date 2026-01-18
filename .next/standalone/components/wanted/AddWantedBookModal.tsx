'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { searchHardcoverBooks, addToWanted, isBookWanted } from '@/lib/actions/wanted';
import { isHardcoverConfigured } from '@/lib/actions/settings';

interface AddWantedBookModalProps {
  onClose: () => void;
}

interface SearchResult {
  id: string;
  title: string;
  author: string;
  isbn?: string;
  coverUrl?: string;
  description?: string;
  publishDate?: string;
  isWanted?: boolean;
}

export function AddWantedBookModal({ onClose }: AddWantedBookModalProps) {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [adding, setAdding] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isConfigured, setIsConfigured] = useState<boolean | null>(null);

  // Check if Hardcover is configured
  useEffect(() => {
    isHardcoverConfigured().then(setIsConfigured);
  }, []);

  const requestIdRef = useRef(0);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;

    const currentRequestId = ++requestIdRef.current;
    setLoading(true);
    setError(null);

    try {
      const response = await searchHardcoverBooks(query);

      if (currentRequestId === requestIdRef.current) {
        if (response.success && response.results) {
          // Check wanted status for each result
          const resultsWithStatus = await Promise.all(
            response.results.map(async (r) => ({
              ...r,
              isWanted: await isBookWanted(r.id, r.isbn, r.title),
            }))
          );
          setResults(resultsWithStatus);

          if (resultsWithStatus.length === 0) {
            setError('No results found');
          }
        } else {
          setError(response.error || 'Search failed');
        }
      }
    } catch {
      if (currentRequestId === requestIdRef.current) {
        setError('Search failed. Please try again.');
      }
    } finally {
      if (currentRequestId === requestIdRef.current) {
        setLoading(false);
      }
    }
  };

  const handleAdd = async (result: SearchResult) => {
    setAdding(result.id);

    const response = await addToWanted({
      hardcoverId: result.id,
      title: result.title,
      author: result.author,
      isbn: result.isbn,
      coverUrl: result.coverUrl,
      description: result.description,
    });

    if (response.success) {
      // Update the result to show it's now wanted
      setResults((prev) =>
        prev.map((r) => (r.id === result.id ? { ...r, isWanted: true } : r))
      );
      router.refresh();
    } else {
      alert(response.error || 'Failed to add book');
    }

    setAdding(null);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="fixed inset-0 bg-black/50" onClick={onClose} />

      <div className="relative bg-shelvarr-surface border border-shelvarr-border rounded-lg w-full max-w-3xl max-h-[80vh] overflow-hidden z-50">
        <div className="p-4 border-b border-shelvarr-border">
          <h2 className="text-lg font-semibold text-white">Add to Wanted List</h2>
          <p className="text-sm text-shelvarr-text-muted mt-1">
            Search for books to add to your wanted list
          </p>
        </div>

        <div className="p-4 border-b border-shelvarr-border">
          <form onSubmit={handleSearch} className="flex gap-2">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by title, author, ISBN..."
              className="flex-1 bg-shelvarr-bg border border-shelvarr-border rounded-lg px-3 py-2 text-white placeholder-shelvarr-text-muted focus:outline-none focus:border-blue-500"
              autoFocus
            />
            <button
              type="submit"
              disabled={loading || !query.trim()}
              className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium transition-colors disabled:opacity-50"
            >
              {loading ? 'Searching...' : 'Search'}
            </button>
          </form>
        </div>

        <div className="overflow-y-auto max-h-[50vh]">
          {isConfigured === false && (
            <div className="m-4 p-4 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
              <div className="flex items-start gap-3">
                <svg className="w-5 h-5 text-yellow-500 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                <div>
                  <p className="text-yellow-500 font-medium">Hardcover API key not configured</p>
                  <p className="text-sm text-shelvarr-text-muted mt-1">
                    To search for books, you need to add your Hardcover API key in settings.
                  </p>
                  <Link
                    href="/settings"
                    className="inline-block mt-2 text-sm text-blue-400 hover:text-blue-300"
                    onClick={onClose}
                  >
                    Go to Settings →
                  </Link>
                </div>
              </div>
            </div>
          )}

          {error && (
            <div className="p-4 text-center text-shelvarr-text-muted">{error}</div>
          )}

          {results.length > 0 && (
            <div className="divide-y divide-shelvarr-border">
              {results.map((result) => (
                <SearchResultItem
                  key={result.id}
                  result={result}
                  onAdd={() => handleAdd(result)}
                  adding={adding === result.id}
                />
              ))}
            </div>
          )}
        </div>

        <div className="p-4 border-t border-shelvarr-border flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 text-shelvarr-text-muted hover:text-white transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

function SearchResultItem({
  result,
  onAdd,
  adding,
}: {
  result: SearchResult;
  onAdd: () => void;
  adding: boolean;
}) {
  return (
    <div className="p-4 flex gap-4">
      <div className="w-16 h-24 bg-shelvarr-bg rounded flex-shrink-0">
        {result.coverUrl ? (
          <img
            src={result.coverUrl}
            alt={result.title}
            className="w-full h-full object-cover rounded"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-shelvarr-text-muted">
            <BookIcon />
          </div>
        )}
      </div>

      <div className="flex-1 min-w-0">
        <h3 className="text-white font-medium line-clamp-1">{result.title}</h3>
        <p className="text-sm text-shelvarr-text-muted">{result.author}</p>

        {result.description && (
          <p className="text-sm text-shelvarr-text-muted line-clamp-2 mt-2">
            {result.description}
          </p>
        )}

        <div className="mt-2 flex items-center gap-4 text-xs text-shelvarr-text-muted">
          {result.publishDate && <span>{result.publishDate}</span>}
          {result.isbn && <span>ISBN: {result.isbn}</span>}
        </div>
      </div>

      {result.isWanted ? (
        <span className="flex-shrink-0 self-center text-green-400 text-sm font-medium">
          Already Wanted
        </span>
      ) : (
        <button
          onClick={onAdd}
          disabled={adding}
          className="flex-shrink-0 self-center bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded text-sm font-medium transition-colors disabled:opacity-50"
        >
          {adding ? 'Adding...' : 'Add to Wanted'}
        </button>
      )}
    </div>
  );
}

function BookIcon() {
  return (
    <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.5}
        d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"
      />
    </svg>
  );
}
