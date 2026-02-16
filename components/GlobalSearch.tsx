'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { searchLocal, type LocalSearchResult } from '@/lib/actions/search';
import { BookIcon, SearchIcon, AuthorIcon, SeriesIcon, LoadingSpinner } from '@/components/ui/Icons';

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
                <SearchIcon className="w-4 h-4 text-blue-400" />
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

