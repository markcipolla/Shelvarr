'use client';

import { useState } from 'react';
import type { WantedBook } from '@/lib/db';
import { WantedBookCard } from './WantedBookCard';
import { DownloadSourcesModal } from './DownloadSourcesModal';
import { BookIcon } from '@/components/ui/Icons';

interface WantedBookGridProps {
  books: WantedBook[];
}

export function WantedBookGrid({ books }: WantedBookGridProps) {
  const [downloadBook, setDownloadBook] = useState<WantedBook | null>(null);

  if (books.length === 0) {
    return (
      <div className="text-center py-12">
        <BookIcon className="w-16 h-16 text-shelvarr-text-muted mx-auto" />
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
