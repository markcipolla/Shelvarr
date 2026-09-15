'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { BookCover } from '@/components/ui/BookCover';
// Type defined inline to avoid importing from server actions
interface CombinedSeriesBook {
  inLibrary: boolean;
  libraryBookId?: number;
  libraryBookCoverUrl?: string | null;
  hardcoverId?: string;
  title: string;
  authors: string;
  position: number | null;
  coverUrl?: string;
  publishDate?: string;
  description?: string;
  isWanted: boolean;
}
import { addToWanted } from '@/lib/actions/wanted';

const COVER_SIZES = '(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 16vw';

interface SeriesBookCardProps {
  book: CombinedSeriesBook;
}

export function SeriesBookCard({ book }: SeriesBookCardProps) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  // Seeded from the server so a book that is already wanted keeps saying so
  // across reloads instead of offering a button that can only fail.
  const [added, setAdded] = useState(book.isWanted);
  const [error, setError] = useState<string | null>(null);

  const handleAddToWanted = async () => {
    if (!book.hardcoverId) return;

    setAdding(true);
    setError(null);
    try {
      const result = await addToWanted({
        hardcoverId: book.hardcoverId,
        title: book.title,
        author: book.authors,
        coverUrl: book.coverUrl,
      });

      // Already on the list counts as done - the user asked for it to be
      // wanted, and it is.
      if (result.success || result.alreadyWanted) {
        setAdded(true);
        router.refresh();
      } else {
        setError(result.error || 'Failed to add book');
      }
    } catch (err) {
      console.error('Failed to add to wanted:', err);
      setError('Failed to add book');
    }
    setAdding(false);
  };

  // Book is in library - link to book detail
  if (book.inLibrary && book.libraryBookId) {
    return (
      <Link href={`/books/${book.libraryBookId}`} className="book-cover-trigger group block">
        <BookCover src={book.coverUrl} title={book.title} author={book.authors} sizes={COVER_SIZES}>
          {/* Position badge */}
          {book.position !== null && (
            <div className="absolute top-2 left-2 bg-blue-600 text-white text-xs font-bold px-2 py-1 rounded">
              #{book.position}
            </div>
          )}
          {/* Owned badge */}
          <div className="absolute top-2 right-2 bg-green-600 text-white text-xs font-bold px-2 py-1 rounded">
            ✓ Owned
          </div>
        </BookCover>
        {/* Info */}
        <div className="pt-3">
          <h3 className="font-medium text-white text-sm truncate group-hover:text-shelvarr-primary transition-colors">
            {book.title}
          </h3>
          <p className="text-xs text-shelvarr-text-muted truncate mt-1">
            {book.authors}
          </p>
        </div>
      </Link>
    );
  }

  // Book is NOT in library - placeholder with Want button
  return (
    <div className="book-cover-trigger opacity-75 hover:opacity-100 transition-opacity">
      <BookCover
        src={book.coverUrl}
        title={book.title}
        author={book.authors}
        sizes={COVER_SIZES}
        muted
        overlay={
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-4">
            {book.hardcoverId && !added && (
              <button
                onClick={handleAddToWanted}
                disabled={adding}
                className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium py-1.5 px-3 rounded transition-colors disabled:opacity-50 shadow-lg"
              >
                {adding ? 'Adding...' : '+ Want'}
              </button>
            )}
            {error && (
              <p role="alert" className="text-center text-xs text-red-400 bg-black/70 rounded px-2 py-1">
                {error}
              </p>
            )}
            {added && (
              <Link
                href="/wanted"
                className="bg-green-600 text-white text-xs font-medium py-1.5 px-3 rounded shadow-lg"
              >
                ✓ Added to Wanted
              </Link>
            )}
          </div>
        }
      >
        {/* Position badge */}
        {book.position !== null && (
          <div className="absolute top-2 left-2 bg-gray-600 text-white text-xs font-bold px-2 py-1 rounded">
            #{book.position}
          </div>
        )}
        {/* Missing badge */}
        <div className="absolute top-2 right-2 bg-yellow-600 text-white text-xs font-bold px-2 py-1 rounded">
          Missing
        </div>
      </BookCover>
      {/* Info */}
      <div className="pt-3">
        <h3 className="font-medium text-shelvarr-text-muted text-sm truncate">
          {book.title}
        </h3>
        <p className="text-xs text-shelvarr-text-muted/70 truncate mt-1">
          {book.authors}
        </p>
      </div>
    </div>
  );
}

