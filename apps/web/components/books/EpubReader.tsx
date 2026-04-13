'use client';

import { useState, useCallback, useEffect } from 'react';
import { ReactReader } from 'react-reader';
import type { Book } from '@/types';
import { formatAuthors } from '@/lib/utils/authors';

interface EpubReaderProps {
  book: Book;
  onClose: () => void;
}

export function EpubReader({ book, onClose }: EpubReaderProps) {
  const [location, setLocation] = useState<string | number>(0);
  const [epubData, setEpubData] = useState<ArrayBuffer | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch epub as ArrayBuffer
  useEffect(() => {
    const fetchEpub = async () => {
      try {
        const response = await fetch(`/api/books/${book.id}/file`);
        if (!response.ok) {
          const data = await response.json();
          throw new Error(data.error || 'Failed to load book');
        }
        const arrayBuffer = await response.arrayBuffer();
        setEpubData(arrayBuffer);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load book');
      } finally {
        setLoading(false);
      }
    };

    fetchEpub();
  }, [book.id]);

  const locationChanged = useCallback((epubcfi: string) => {
    setLocation(epubcfi);
  }, []);

  return (
    <div className="fixed inset-0 !-mt-0 z-50 bg-black flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-shelvarr-surface border-b border-shelvarr-border">
        <div className="flex items-center gap-3">
          <button
            onClick={onClose}
            className="text-shelvarr-text-muted hover:text-white transition-colors"
            aria-label="Close reader"
          >
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
          <div>
            <h1 className="text-white font-medium line-clamp-1">{book.title || 'Unknown Title'}</h1>
            {book.authors && (
              <p className="text-sm text-shelvarr-text-muted line-clamp-1">
                {formatAuthors(book.authors)}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Reader */}
      <div className="flex-1 bg-white">
        {loading && (
          <div className="h-full flex items-center justify-center">
            <div className="text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
              <p className="mt-4 text-gray-600">Loading book...</p>
            </div>
          </div>
        )}

        {error && (
          <div className="h-full flex items-center justify-center">
            <div className="text-center text-red-600">
              <p className="text-lg font-medium">Failed to load book</p>
              <p className="mt-2">{error}</p>
              <button
                onClick={onClose}
                className="mt-4 px-4 py-2 bg-gray-200 rounded hover:bg-gray-300"
              >
                Close
              </button>
            </div>
          </div>
        )}

        {epubData && (
          <ReactReader
            url={epubData}
            location={location}
            locationChanged={locationChanged}
            showToc={true}
            epubOptions={{
              flow: 'scrolled',
              manager: 'continuous',
            }}
          />
        )}
      </div>
    </div>
  );
}
