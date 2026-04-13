import Link from 'next/link';
import type { Book } from '@/types';
import { formatAuthors } from '@/lib/utils/authors';
import { BookIcon } from '@/components/ui/Icons';

interface BookGridProps {
  books: Book[];
}

export function BookGrid({ books }: BookGridProps) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-7 3xl:grid-cols-7 gap-4">
      {books.map((book) => (
        <BookCard key={book.id} book={book} />
      ))}
    </div>
  );
}

interface BookCardProps {
  book: Book;
  showSeriesNumber?: boolean;
}

export function BookCard({ book, showSeriesNumber }: BookCardProps) {
  const authors = formatAuthors(book.authors);
  const title = book.title || getFilenameFromPath(book.filePath);

  return (
    <Link
      href={`/books/${book.id}`}
      className="group block bg-shelvarr-surface border border-shelvarr-border rounded-lg overflow-hidden hover:border-shelvarr-primary transition-colors"
    >
      <div className="aspect-[2/3] bg-shelvarr-bg relative">
        {book.coverUrl ? (
          <img
            src={book.coverUrl}
            alt={title}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center p-2">
            <BookIcon className="w-12 h-12 text-shelvarr-text-muted" />
          </div>
        )}
        {showSeriesNumber && book.seriesNumber && (
          <div className="absolute top-2 left-2 bg-shelvarr-primary text-white text-xs font-bold px-2 py-1 rounded">
            #{book.seriesNumber}
          </div>
        )}
      </div>
      <div className="p-2">
        <h3 className="text-sm font-medium text-white line-clamp-2 group-hover:text-shelvarr-primary transition-colors">
          {title}
        </h3>
        {authors && (
          <p className="text-xs text-shelvarr-text-muted line-clamp-1 mt-0.5">
            {authors}
          </p>
        )}
        {!showSeriesNumber && book.seriesName && (
          <p className="text-xs text-shelvarr-primary line-clamp-1 mt-0.5">
            {book.seriesName}
            {book.seriesNumber ? ` #${book.seriesNumber}` : ''}
          </p>
        )}
      </div>
    </Link>
  );
}

function getFilenameFromPath(filePath: string): string {
  const parts = filePath.split(/[/\\]/);
  const filename = parts[parts.length - 1] || filePath;
  return filename.replace(/\.[^.]+$/, '');
}
