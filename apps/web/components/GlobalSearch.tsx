'use client';

import { useState, useEffect } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { SearchIcon } from '@/components/ui/Icons';

export function GlobalSearch() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const onSearchPage = pathname === '/search';
  const urlQuery = onSearchPage ? (searchParams.get('q') ?? '') : '';

  const [query, setQuery] = useState(urlQuery);

  // When the user navigates away from /search (e.g. clicks Home/Books/Comics),
  // clear the search input. When they return to /search, sync to the URL.
  useEffect(() => {
    setQuery(urlQuery);
  }, [urlQuery, onSearchPage]);

  // Searching only happens when the user asks for it: Enter, or the search button.
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = query.trim();
    if (!trimmed) {
      // Nothing to search for — leave /search if we're there, otherwise no-op.
      if (onSearchPage) router.replace('/search');
      return;
    }
    const target = `/search?q=${encodeURIComponent(trimmed)}`;
    if (onSearchPage) {
      router.replace(target);
    } else {
      router.push(target);
    }
  };

  const handleClear = () => {
    setQuery('');
    if (onSearchPage) router.replace('/search');
  };

  return (
    <form onSubmit={handleSubmit} role="search" className="relative max-w-2xl mx-auto">
      <button
        type="submit"
        aria-label="Search"
        className="absolute left-1 top-1/2 -translate-y-1/2 p-2 rounded text-shelvarr-text-muted hover:text-white hover:bg-shelvarr-bg transition-colors"
      >
        <SearchIcon className="w-4 h-4" />
      </button>
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search books, comics, authors..."
        className="w-full bg-shelvarr-surface border border-shelvarr-border rounded-lg pl-9 pr-9 py-2 text-sm text-white placeholder:text-shelvarr-text-muted focus:outline-none focus:border-shelvarr-primary"
      />
      {query && (
        <button
          type="button"
          onClick={handleClear}
          aria-label="Clear search"
          className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded text-shelvarr-text-muted hover:text-white hover:bg-shelvarr-bg transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      )}
    </form>
  );
}
