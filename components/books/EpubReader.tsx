'use client';

import { useState, useCallback } from 'react';
import { ReactReader } from 'react-reader';
import type { Book } from '@/types';

interface EpubReaderProps {
  book: Book;
  onClose: () => void;
}

export function EpubReader({ book, onClose }: EpubReaderProps) {
  const [location, setLocation] = useState<string | number>(0);

  const locationChanged = useCallback((epubcfi: string) => {
    setLocation(epubcfi);
  }, []);

  const epubUrl = `/api/books/${book.id}/file`;

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col">
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
                {JSON.parse(book.authors).join(', ')}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Reader */}
      <div className="flex-1 bg-white">
        <ReactReader
          url={epubUrl}
          location={location}
          locationChanged={locationChanged}
          showToc={true}
          epubOptions={{
            flow: 'scrolled',
            manager: 'continuous',
          }}
        />
      </div>
    </div>
  );
}
