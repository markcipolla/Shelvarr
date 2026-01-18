'use client';

import { useState } from 'react';
import type { WantedBook } from '@/lib/db';
import { WantedBookCard } from './WantedBookCard';
import { DownloadSourcesModal } from './DownloadSourcesModal';

interface WantedBookGridProps {
  books: WantedBook[];
}

export function WantedBookGrid({ books }: WantedBookGridProps) {
  const [downloadBook, setDownloadBook] = useState<WantedBook | null>(null);

  if (books.length === 0) {
    return (
      <div className="text-center py-12">
        <BookIcon />
        <h3 className="text-lg font-medium text-white mt-4">No wanted books yet</h3>
        <p className="text-shelvarr-text-muted mt-1">
          Search for books to add to your wanted list
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
        {books.map((book) => (
          <WantedBookCard
            key={book.id}
            book={book}
            onFindDownloads={setDownloadBook}
          />
        ))}
      </div>

      {downloadBook && (
        <DownloadSourcesModal
          book={downloadBook}
          onClose={() => setDownloadBook(null)}
        />
      )}
    </>
  );
}

function BookIcon() {
  return (
    <svg
      className="w-16 h-16 text-shelvarr-text-muted mx-auto"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.5}
        d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"
      />
    </svg>
  );
}
