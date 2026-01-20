'use client';

import { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
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
}
import { addToWanted } from '@/lib/actions/wanted';

interface SeriesBookCardProps {
  book: CombinedSeriesBook;
}

export function SeriesBookCard({ book }: SeriesBookCardProps) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [added, setAdded] = useState(false);

  const handleAddToWanted = async () => {
    if (!book.hardcoverId) return;

    setAdding(true);
    try {
      const result = await addToWanted({
        hardcoverId: book.hardcoverId,
        title: book.title,
        author: book.authors,
        coverUrl: book.coverUrl,
      });

      if (result.success) {
        setAdded(true);
        router.refresh();
      }
    } catch (error) {
      console.error('Failed to add to wanted:', error);
    }
    setAdding(false);
  };

  // Book is in library - link to book detail
  if (book.inLibrary && book.libraryBookId) {
    return (
      <Link href={`/books/${book.libraryBookId}`} className="group">
        <div className="bg-shelvarr-surface border border-shelvarr-border rounded-lg overflow-hidden hover:border-shelvarr-primary transition-colors">
          {/* Cover Image */}
          <div className="aspect-[2/3] relative bg-shelvarr-bg">
            {book.coverUrl ? (
              <Image
                src={book.coverUrl}
                alt={book.title}
                fill
                className="object-cover"
                sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 16vw"
              />
            ) : (
              <div className="absolute inset-0 flex items-center justify-center text-shelvarr-text-muted">
                <BookIcon />
              </div>
            )}
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
          </div>
          {/* Info */}
          <div className="p-3">
            <h3 className="font-medium text-white text-sm truncate group-hover:text-shelvarr-primary transition-colors">
              {book.title}
            </h3>
            <p className="text-xs text-shelvarr-text-muted truncate mt-1">
              {book.authors}
            </p>
          </div>
        </div>
      </Link>
    );
  }

  // Book is NOT in library - placeholder with Want button
  return (
    <div className="bg-shelvarr-surface border border-dashed border-shelvarr-border rounded-lg overflow-hidden opacity-75 hover:opacity-100 transition-opacity">
      {/* Cover Image */}
      <div className="aspect-[2/3] relative bg-shelvarr-bg/50">
        {book.coverUrl ? (
          <Image
            src={book.coverUrl}
            alt={book.title}
            fill
            className="object-cover grayscale"
            sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 16vw"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-shelvarr-text-muted">
            <BookIcon />
          </div>
        )}
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
        {/* Want button overlay */}
        <div className="absolute inset-0 flex items-center justify-center p-4">
          {book.hardcoverId && !added && (
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
              ✓ Added to Wanted
            </Link>
          )}
        </div>
      </div>
      {/* Info */}
      <div className="p-3">
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

function BookIcon() {
  return (
    <svg className="w-12 h-12" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1}
        d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"
      />
    </svg>
  );
}
