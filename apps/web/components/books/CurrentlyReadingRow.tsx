'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Book } from '@/types';
import { BookCard } from '@/components/books/BookGrid';
import { useToast } from '@/components/ui/Toast';

export function CurrentlyReadingRow({ books }: { books: Book[] }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7 gap-4">
      {books.map((book) => (
        <CurrentlyReadingCard key={book.id} book={book} />
      ))}
    </div>
  );
}

function CurrentlyReadingCard({ book }: { book: Book }) {
  const router = useRouter();
  const toast = useToast();
  const [removing, setRemoving] = useState(false);
  const title = book.title || 'this book';

  // The "×" sits inside the card's link, so its click must not also open the book.
  const handleRemove = async (event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    setRemoving(true);
    try {
      const res = await fetch(`/api/books/${book.id}/read-progress`, { method: 'DELETE' });
      if (res.ok) {
        router.refresh();
      } else {
        toast.error('Failed to remove from Currently Reading');
      }
    } catch {
      toast.error('Failed to reach server');
    } finally {
      setRemoving(false);
    }
  };

  return (
    <BookCard
      book={book}
      overlay={
        <button
          onClick={handleRemove}
          disabled={removing}
          title="Remove from Currently Reading"
          aria-label={`Remove "${title}" from Currently Reading`}
          className="absolute top-2 left-2 w-6 h-6 rounded-full bg-black/60 hover:bg-black/80 text-white text-base leading-none flex items-center justify-center transition-colors disabled:opacity-50"
        >
          {removing ? '·' : '×'}
        </button>
      }
    />
  );
}
