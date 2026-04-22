'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';
import { addToWanted } from '@/lib/actions/wanted';
import { BookIcon, LoadingSpinner } from '@/components/ui/Icons';
import { HardcoverNotConfigured } from '@/components/ui/HardcoverNotConfigured';
import { BookCard } from '@/components/books/BookGrid';
import { ComicCard } from '@/components/comics/ComicGrid';
import type { SearchResultWithStatus } from '@/app/search/page';
import type { Book } from '@/types';
import type { KapowarrVolume } from '@shelvarr/types';

interface SearchPageProps {
  initialQuery: string;
  initialResults: SearchResultWithStatus[];
  initialLocalBooks?: Book[];
  initialLocalComics?: KapowarrVolume[];
  isConfigured: boolean;
}

export function SearchPage({
  initialQuery,
  initialResults,
  initialLocalBooks = [],
  initialLocalComics = [],
  isConfigured,
}: SearchPageProps) {
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

  const hasLocalResults = initialLocalBooks.length > 0 || initialLocalComics.length > 0;
  const hasAnyResults = hasLocalResults || initialResults.length > 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white">Search</h1>
        <p className="text-shelvarr-text-muted mt-1">Search your library and Hardcover</p>
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

      {/* Loading state */}
      {isPending && (
        <div className="flex justify-center py-12">
          <LoadingSpinner className="w-8 h-8 animate-spin text-shelvarr-text-muted" />
        </div>
      )}

      {/* Local Books */}
      {!isPending && initialLocalBooks.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-white">Books in Your Library</h2>
            <span className="text-sm text-shelvarr-text-muted">
              {initialLocalBooks.length} {initialLocalBooks.length === 1 ? 'result' : 'results'}
            </span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7 gap-4">
            {initialLocalBooks.map((book) => (
              <BookCard key={book.id} book={book} />
            ))}
          </div>
        </section>
      )}

      {/* Local Comics */}
      {!isPending && initialLocalComics.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-white">Comics</h2>
            <span className="text-sm text-shelvarr-text-muted">
              {initialLocalComics.length} {initialLocalComics.length === 1 ? 'result' : 'results'}
            </span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7 gap-4">
            {initialLocalComics.map((volume) => (
              <ComicCard key={volume.id} volume={volume} />
            ))}
          </div>
        </section>
      )}

      {/* Hardcover results */}
      {!isPending && initialResults.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-white">From Hardcover</h2>
            <span className="text-sm text-shelvarr-text-muted">
              {initialResults.length} {initialResults.length === 1 ? 'result' : 'results'}
            </span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
            {initialResults.map((result) => (
              <SearchResultCard key={result.hardcoverId} result={result} />
            ))}
          </div>
        </section>
      )}

      {/* Not configured warning */}
      {!isPending && !isConfigured && (
        <HardcoverNotConfigured
          description="To search for books on Hardcover, you need to add your Hardcover API key in settings."
        />
      )}

      {/* No results */}
      {!isPending && initialQuery && !hasAnyResults && isConfigured && (
        <div className="bg-shelvarr-surface border border-shelvarr-border rounded-lg p-8 text-center">
          <p className="text-shelvarr-text-muted">No results found for &ldquo;{initialQuery}&rdquo;</p>
        </div>
      )}

      {/* Empty state - no query yet */}
      {!isPending && !initialQuery && isConfigured && (
        <div className="bg-shelvarr-surface border border-shelvarr-border rounded-lg p-8 text-center">
          <p className="text-shelvarr-text-muted">
            Enter a search term above to find books and comics in your library or on Hardcover
          </p>
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
