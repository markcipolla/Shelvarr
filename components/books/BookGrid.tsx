import Link from 'next/link';
import type { Book } from '@/types';

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
  const authors = book.authors ? JSON.parse(book.authors).join(', ') : null;
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
            <BookIcon />
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

function BookIcon() {
  return (
    <svg
      className="w-12 h-12 text-shelvarr-text-muted"
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
