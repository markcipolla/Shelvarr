'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useState, useEffect } from 'react';
import { SearchIcon } from '@/components/ui/Icons';

interface AuthorSearchProps {
  currentSearch: string;
}

export function AuthorSearch({ currentSearch }: AuthorSearchProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [search, setSearch] = useState(currentSearch);

  useEffect(() => {
    setSearch(currentSearch);
  }, [currentSearch]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const params = new URLSearchParams(searchParams.toString());
    if (search) {
      params.set('search', search);
    } else {
      params.delete('search');
    }
    router.push(`/authors?${params.toString()}`);
  };

  const handleClear = () => {
    setSearch('');
    router.push('/authors');
  };

  return (
    <form onSubmit={handleSubmit} className="flex gap-2">
      <div className="relative flex-1">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search authors..."
          className="w-full bg-shelvarr-surface border border-shelvarr-border rounded-lg pl-10 pr-4 py-2 text-white placeholder-shelvarr-text-muted focus:outline-none focus:border-blue-500"
        />
        <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-shelvarr-text-muted" />
      </div>
      <button
        type="submit"
        className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium transition-colors"
      >
        Search
      </button>
      {currentSearch && (
        <button
          type="button"
          onClick={handleClear}
          className="bg-shelvarr-surface hover:bg-shelvarr-border text-white border border-shelvarr-border px-4 py-2 rounded-lg font-medium transition-colors"
        >
          Clear
        </button>
      )}
    </form>
  );
}

