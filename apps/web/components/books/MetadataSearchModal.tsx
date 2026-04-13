'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import type { Book } from '@/types';
import { searchMetadata, applyMetadata } from '@/lib/actions/books';
import { isHardcoverConfigured } from '@/lib/actions/settings';
import type { BookMetadata } from '@/lib/services/metadata';
import { useToast } from '@/components/ui/Toast';
import { BookIcon } from '@/components/ui/Icons';
import { HardcoverNotConfigured } from '@/components/ui/HardcoverNotConfigured';
import { parseAuthors } from '@/lib/utils/authors';

interface MetadataSearchModalProps {
  book: Book;
  initialQuery?: string;
  onClose: () => void;
}

export function MetadataSearchModal({
  book,
  initialQuery: providedQuery,
  onClose,
}: MetadataSearchModalProps) {
  const router = useRouter();
  const toast = useToast();
  const authors = parseAuthors(book.authors).join(' ');
  const defaultQuery = book.title ? `${book.title} ${authors}`.trim() : '';

  const [query, setQuery] = useState(providedQuery ?? defaultQuery);
  const [results, setResults] = useState<BookMetadata[]>([]);
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isConfigured, setIsConfigured] = useState<boolean | null>(null);

  // Check if Hardcover is configured
  useEffect(() => {
    isHardcoverConfigured().then(setIsConfigured);
  }, []);

  // Request ID to prevent race conditions
  const requestIdRef = useRef(0);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;

    const currentRequestId = ++requestIdRef.current;
    setLoading(true);
    setError(null);

    const response = await searchMetadata(query);

    // Only update if this is still the latest request
    if (currentRequestId === requestIdRef.current) {
      setLoading(false);

      if (response.error) {
        setError(response.error);
        setResults([]);
      } else if (response.results) {
        setResults(response.results);
        if (response.results.length === 0) {
          setError('No results found');
        }
      }
    }
  };

  const handleApply = async (metadata: BookMetadata) => {
    setApplying(metadata.sourceId);

    const result = await applyMetadata(book.id, metadata.source, metadata.sourceId);

    setApplying(null);

    if (result.error) {
      toast.error(result.error);
    } else {
      toast.success('Metadata applied');
      router.refresh();
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="fixed inset-0 bg-black/50" onClick={onClose} />

      <div className="relative bg-shelvarr-surface border border-shelvarr-border rounded-lg w-full max-w-3xl max-h-[80vh] overflow-hidden z-50">
        <div className="p-4 border-b border-shelvarr-border">
          <h2 className="text-lg font-semibold text-white">Search Metadata</h2>
          <p className="text-sm text-shelvarr-text-muted mt-1">
            Search for book metadata from Hardcover
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
            <div className="m-4">
              <HardcoverNotConfigured
                description="To search for book metadata, you need to add your Hardcover API key in settings."
                onLinkClick={onClose}
              />
            </div>
          )}

          {error && (
            <div className="p-4 text-center text-shelvarr-text-muted">{error}</div>
          )}

          {results.length > 0 && (
            <div className="divide-y divide-shelvarr-border">
              {results.map((result, index) => (
                <MetadataResult
                  key={`${result.source}-${result.sourceId}-${index}`}
                  metadata={result}
                  onApply={() => handleApply(result)}
                  applying={applying === result.sourceId}
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
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

function MetadataResult({
  metadata,
  onApply,
  applying,
}: {
  metadata: BookMetadata;
  onApply: () => void;
  applying: boolean;
}) {
  return (
    <div className="p-4 flex gap-4">
      <div className="w-16 h-24 bg-shelvarr-bg rounded flex-shrink-0">
        {metadata.coverUrl ? (
          <img
            src={metadata.coverUrl}
            alt={metadata.title}
            className="w-full h-full object-cover rounded"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-shelvarr-text-muted">
            <BookIcon className="w-8 h-8" />
          </div>
        )}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h3 className="text-white font-medium line-clamp-1">{metadata.title}</h3>
            <p className="text-sm text-shelvarr-text-muted">{metadata.authors}</p>
          </div>
          <span className="flex-shrink-0 text-xs px-2 py-0.5 bg-shelvarr-bg rounded text-shelvarr-text-muted">
            {metadata.source}
          </span>
        </div>

        {metadata.series && metadata.series.length > 0 && (
          <div className="text-sm text-shelvarr-primary mt-1">
            {metadata.series.map(([name, pos], i) => (
              <span key={i}>
                {i > 0 && ' • '}
                {name}{pos ? ` #${pos}` : ''}
              </span>
            ))}
          </div>
        )}

        <p className="text-sm text-shelvarr-text-muted line-clamp-2 mt-2">
          {metadata.description || 'No description available'}
        </p>

        <div className="mt-2 flex items-center gap-4 text-xs text-shelvarr-text-muted">
          {metadata.publishDate && <span>{metadata.publishDate}</span>}
          {metadata.publisher && <span>{metadata.publisher}</span>}
          {metadata.isbn && <span>ISBN: {metadata.isbn}</span>}
        </div>
      </div>

      <button
        onClick={onApply}
        disabled={applying}
        className="flex-shrink-0 self-center bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded text-sm font-medium transition-colors disabled:opacity-50"
      >
        {applying ? 'Applying...' : 'Apply'}
      </button>
    </div>
  );
}
