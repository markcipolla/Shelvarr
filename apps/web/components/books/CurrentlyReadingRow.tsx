'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Book } from '@/types';
import { BookCard } from '@/components/books/BookGrid';
import { useToast } from '@/components/ui/Toast';

/**
 * The home page's Currently Reading shelf. Same cards as any other row, plus an
 * "×" on each cover: a book you finished away from the reader — on paper, on a
 * Kindle — never reaches its last page here, so it would sit on this shelf for
 * good otherwise.
 *
 * Misclicking that "×" on a cover two rows into the grid is easy, so the
 * confirmation toast carries the way back.
 */
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
  const [marking, setMarking] = useState(false);
  const title = book.title || 'this book';

  // The page is left out of both requests on purpose: the server keeps whatever
  // page was saved, so undoing this reopens the book exactly where it was.
  const setCompleted = async (completed: boolean): Promise<boolean> => {
    const res = await fetch(`/api/books/${book.id}/read-progress`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ completed }),
    });
    if (res.ok) {
      router.refresh();
      return true;
    }
    const data = await res.json().catch(() => null);
    toast.error(data?.error || (completed ? 'Failed to mark as read' : 'Failed to undo'));
    return false;
  };

  // The "×" sits inside the card's link, so its click must not also open the
  // book.
  const handleMarkRead = async (event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    setMarking(true);
    try {
      if (await setCompleted(true)) {
        toast.success(`Marked "${title}" as read`, {
          label: 'Undo',
          onClick: () => {
            void setCompleted(false).catch(() => toast.error('Failed to reach server'));
          },
        });
      }
    } catch {
      toast.error('Failed to reach server');
    } finally {
      setMarking(false);
    }
  };

  return (
    <BookCard
      book={book}
      overlay={
        <button
          onClick={handleMarkRead}
          disabled={marking}
          title="Finished — take it off this shelf"
          aria-label={`Finished "${title}" — remove from Currently Reading`}
          className="absolute top-2 left-2 w-6 h-6 rounded-full bg-black/60 hover:bg-black/80 text-white text-base leading-none flex items-center justify-center transition-colors disabled:opacity-50"
        >
          {marking ? '·' : '×'}
        </button>
      }
    />
  );
}
