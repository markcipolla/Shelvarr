'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

interface SeriesSearchProps {
  currentSearch: string;
}

export function SeriesSearch({ currentSearch }: SeriesSearchProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [search, setSearch] = useState(currentSearch);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    startTransition(() => {
      router.push(search ? `/series?search=${encodeURIComponent(search)}` : '/series');
    });
  };

  return (
    <form onSubmit={handleSubmit} className="flex gap-2">
      <div className="relative flex-1">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search series..."
          className="w-full bg-shelvarr-surface border border-shelvarr-border rounded-lg pl-10 pr-4 py-2 text-white placeholder-shelvarr-text-muted focus:outline-none focus:border-blue-500"
        />
        <svg
          className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-shelvarr-text-muted"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
          />
        </svg>
        {isPending && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2">
            <svg className="animate-spin h-4 w-4 text-blue-500" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
          </div>
        )}
      </div>
      {currentSearch && (
        <button
          type="button"
          onClick={() => {
            setSearch('');
            startTransition(() => {
              router.push('/series');
            });
          }}
          className="px-3 py-2 text-shelvarr-text-muted hover:text-white transition-colors"
        >
          Clear
        </button>
      )}
    </form>
  );
}
