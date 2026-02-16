'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { searchLocal, type LocalSearchResult } from '@/lib/actions/search';

export function GlobalSearch() {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [localResults, setLocalResults] = useState<LocalSearchResult[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Debounced search
  const doSearch = useCallback(async (searchQuery: string) => {
    if (searchQuery.length < 2) {
      setLocalResults([]);
      return;
    }

    setIsLoading(true);
    try {
      const local = await searchLocal(searchQuery);
      setLocalResults(local);
    } catch (err) {
      console.error('Search error:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
    debounceRef.current = setTimeout(() => {
      doSearch(query);
    }, 300);
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [query, doSearch]);

  const handleSelect = (result: LocalSearchResult) => {
    router.push(result.href);
    setIsOpen(false);
    setQuery('');
  };

  const handleSearchHardcover = () => {
    router.push(`/search?q=${encodeURIComponent(query)}`);
    setIsOpen(false);
    setQuery('');
  };

  const typeIcons: Record<string, React.ReactNode> = {
    book: <BookIcon className="w-4 h-4" />,
    author: <AuthorIcon className="w-4 h-4" />,
    series: <SeriesIcon className="w-4 h-4" />,
  };

  const showDropdown = isOpen && query.length >= 2;

  return (
    <div ref={containerRef} className="relative">
      <div className="relative">
        <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-shelvarr-text-muted" />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setIsOpen(true);
          }}
          onFocus={() => setIsOpen(true)}
          placeholder="Search books, authors..."
          className="w-full bg-shelvarr-bg border border-shelvarr-border rounded-lg pl-9 pr-3 py-2 text-sm text-white placeholder:text-shelvarr-text-muted focus:outline-none focus:border-shelvarr-primary"
        />
        {isLoading && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2">
            <LoadingSpinner />
          </div>
        )}
      </div>

      {showDropdown && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-shelvarr-surface border border-shelvarr-border rounded-lg shadow-lg overflow-hidden z-50 max-h-[70vh] overflow-y-auto">
          {/* Local Results */}
          {localResults.length > 0 && (
            <div>
              <div className="px-3 py-1.5 text-xs font-medium text-shelvarr-text-muted bg-shelvarr-bg/50">
                In Your Library
              </div>
              {localResults.map((result) => (
                <button
                  key={`${result.type}-${result.id}`}
                  onClick={() => handleSelect(result)}
                  className="w-full flex items-center gap-3 px-3 py-2 hover:bg-shelvarr-bg text-left transition-colors"
                >
                  {result.coverUrl ? (
                    <img
                      src={result.coverUrl}
                      alt=""
                      className="w-8 h-10 object-cover rounded"
                    />
                  ) : (
                    <div className="w-8 h-10 bg-shelvarr-bg rounded flex items-center justify-center text-shelvarr-text-muted">
                      {typeIcons[result.type]}
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-white truncate">{result.title}</div>
                    {result.subtitle && (
                      <div className="text-xs text-shelvarr-text-muted truncate">{result.subtitle}</div>
                    )}
                  </div>
                  <span className="text-xs text-shelvarr-text-muted capitalize">{result.type}</span>
                </button>
              ))}
            </div>
          )}

          {/* Search Hardcover option */}
          {query.length >= 2 && (
            <button
              onClick={handleSearchHardcover}
              className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-shelvarr-bg text-left transition-colors border-t border-shelvarr-border"
            >
              <div className="w-8 h-8 bg-blue-600/20 rounded flex items-center justify-center">
                <CloudSearchIcon className="w-4 h-4 text-blue-400" />
              </div>
              <div className="flex-1">
                <div className="text-sm text-blue-400">Search Hardcover for &ldquo;{query}&rdquo;</div>
                <div className="text-xs text-shelvarr-text-muted">Find books to add to your wanted list</div>
              </div>
            </button>
          )}

          {/* No results */}
          {!isLoading && query.length >= 2 && localResults.length === 0 && (
            <div className="px-3 py-4 text-center text-sm text-shelvarr-text-muted">
              No local results found
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function SearchIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
    </svg>
  );
}

function BookIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
    </svg>
  );
}

function AuthorIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
    </svg>
  );
}

function SeriesIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
    </svg>
  );
}

function CloudSearchIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
    </svg>
  );
}

function LoadingSpinner() {
  return (
    <svg className="w-4 h-4 animate-spin text-shelvarr-text-muted" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
    </svg>
  );
}
