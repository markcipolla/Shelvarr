'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';
import { addToWanted } from '@/lib/actions/wanted';
import { BookIcon, LoadingSpinner } from '@/components/ui/Icons';
import { HardcoverNotConfigured } from '@/components/ui/HardcoverNotConfigured';
import type { SearchResultWithStatus } from '@/app/search/page';

interface SearchPageProps {
  initialQuery: string;
  initialResults: SearchResultWithStatus[];
  isConfigured: boolean;
}

export function SearchPage({ initialQuery, initialResults, isConfigured }: SearchPageProps) {
  const router = useRouter();
  const [query, setQuery] = useState(initialQuery);
  const [isPending, startTransition] = useTransition();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = query.trim();
    if (!trimmed) return;
    startTransition(() => {
      router.push(`/search?q=${encodeURIComponent(trimmed)}`);
    });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white">Search Hardcover</h1>
        <p className="text-shelvarr-text-muted mt-1">Find books to add to your wanted list</p>
      </div>

      {/* Search form */}
      <form onSubmit={handleSubmit} className="flex gap-2">
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
          disabled={isPending || !query.trim()}
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium transition-colors disabled:opacity-50"
        >
          {isPending ? 'Searching...' : 'Search'}
        </button>
      </form>

      {/* Not configured warning */}
      {!isConfigured && (
        <HardcoverNotConfigured
          description="To search for books, you need to add your Hardcover API key in settings."
        />
      )}

      {/* Loading state */}
      {isPending && (
        <div className="flex justify-center py-12">
          <LoadingSpinner className="w-8 h-8 animate-spin text-shelvarr-text-muted" />
        </div>
      )}

      {/* Results grid */}
      {!isPending && initialResults.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
          {initialResults.map((result) => (
            <SearchResultCard key={result.hardcoverId} result={result} />
          ))}
        </div>
      )}

      {/* No results */}
      {!isPending && initialQuery && initialResults.length === 0 && isConfigured && (
        <div className="bg-shelvarr-surface border border-shelvarr-border rounded-lg p-8 text-center">
          <p className="text-shelvarr-text-muted">No results found for &ldquo;{initialQuery}&rdquo;</p>
        </div>
      )}

      {/* Empty state - no query yet */}
      {!isPending && !initialQuery && isConfigured && (
        <div className="bg-shelvarr-surface border border-shelvarr-border rounded-lg p-8 text-center">
          <p className="text-shelvarr-text-muted">Enter a search term above to find books on Hardcover</p>
        </div>
      )}
    </div>
  );
}

function SearchResultCard({ result }: { result: SearchResultWithStatus }) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [added, setAdded] = useState(result.isWanted);

  const handleAddToWanted = async () => {
    setAdding(true);
    try {
      const response = await addToWanted({
        hardcoverId: result.hardcoverId,
        title: result.title,
        author: result.author,
        coverUrl: result.coverUrl,
        description: result.description,
      });
      if (response.success) {
        setAdded(true);
        router.refresh();
      }
    } catch (error) {
      console.error('Failed to add to wanted:', error);
    }
    setAdding(false);
  };

  return (
    <div className="bg-shelvarr-surface border border-shelvarr-border rounded-lg overflow-hidden">
      {/* Cover Image */}
      <div className="aspect-[2/3] relative bg-shelvarr-bg">
        {result.coverUrl ? (
          <Image
            src={result.coverUrl}
            alt={result.title}
            fill
            className="object-cover"
            sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 16vw"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-shelvarr-text-muted">
            <BookIcon className="w-12 h-12" />
          </div>
        )}
        {/* Want button overlay */}
        <div className="absolute inset-0 flex items-center justify-center p-4">
          {!added && (
            <button
              onClick={handleAddToWanted}
              disabled={adding}
              className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium py-1.5 px-3 rounded transition-colors disabled:opacity-50 shadow-lg"
            >
              {adding ? 'Adding...' : '+ Want'}
            </button>
          )}
          {added && (
            <Link
              href="/wanted"
              className="bg-green-600 text-white text-xs font-medium py-1.5 px-3 rounded shadow-lg"
            >
              Already Wanted
            </Link>
          )}
        </div>
      </div>
      {/* Info */}
      <div className="p-3">
        <h3 className="font-medium text-white text-sm truncate">{result.title}</h3>
        <p className="text-xs text-shelvarr-text-muted truncate mt-1">
          {result.author}{result.publishYear && ` (${result.publishYear})`}
        </p>
      </div>
    </div>
  );
}

