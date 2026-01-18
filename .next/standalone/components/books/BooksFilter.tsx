'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useState, useTransition } from 'react';
import type { Library } from '@/types';

interface LibraryWithCount extends Library {
  bookCount: number;
}

interface BooksFilterProps {
  libraries: LibraryWithCount[];
  currentLibrary?: number;
  currentSearch?: string;
}

export function BooksFilter({
  libraries,
  currentLibrary,
  currentSearch = '',
}: BooksFilterProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const [searchValue, setSearchValue] = useState(currentSearch);

  const updateFilters = (updates: Record<string, string | undefined>) => {
    const params = new URLSearchParams(searchParams.toString());

    Object.entries(updates).forEach(([key, value]) => {
      if (value) {
        params.set(key, value);
      } else {
        params.delete(key);
      }
    });

    // Reset to page 1 when filters change
    params.delete('page');

    startTransition(() => {
      router.push(`/books?${params.toString()}`);
    });
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    updateFilters({ search: searchValue || undefined });
  };

  return (
    <div className="flex flex-col sm:flex-row gap-4">
      <form onSubmit={handleSearch} className="flex-1">
        <div className="relative">
          <input
            type="text"
            placeholder="Search books..."
            value={searchValue}
            onChange={(e) => setSearchValue(e.target.value)}
            className="w-full bg-shelvarr-surface border border-shelvarr-border rounded-lg pl-10 pr-4 py-2 text-white placeholder-shelvarr-text-muted focus:outline-none focus:border-blue-500"
          />
          <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-shelvarr-text-muted" />
          {isPending && (
            <div className="absolute right-3 top-1/2 -translate-y-1/2">
              <Spinner />
            </div>
          )}
        </div>
      </form>

      <select
        value={currentLibrary || ''}
        onChange={(e) =>
          updateFilters({ library: e.target.value || undefined })
        }
        className="bg-shelvarr-surface border border-shelvarr-border rounded-lg px-3 py-2 text-white focus:outline-none focus:border-blue-500"
      >
        <option value="">All Libraries</option>
        {libraries.map((lib) => (
          <option key={lib.id} value={lib.id}>
            {lib.name} ({lib.bookCount})
          </option>
        ))}
      </select>

      {(currentSearch || currentLibrary) && (
        <button
          onClick={() => {
            setSearchValue('');
            updateFilters({ search: undefined, library: undefined });
          }}
          className="px-3 py-2 text-shelvarr-text-muted hover:text-white transition-colors"
        >
          Clear filters
        </button>
      )}
    </div>
  );
}

function SearchIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
      />
    </svg>
  );
}

function Spinner() {
  return (
    <svg
      className="animate-spin h-4 w-4 text-blue-500"
      fill="none"
      viewBox="0 0 24 24"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
      />
    </svg>
  );
}
