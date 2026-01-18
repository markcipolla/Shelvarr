import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getBooksBySeries, getSeriesInfo } from '@/lib/actions/series';
import { BookCard } from '@/components/books/BookGrid';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ name: string }>;
}

export default async function SeriesDetailPage({ params }: PageProps) {
  const { name } = await params;
  const seriesName = decodeURIComponent(name);

  const [seriesInfo, books] = await Promise.all([
    getSeriesInfo(seriesName),
    getBooksBySeries(seriesName),
  ]);

  if (!seriesInfo) {
    notFound();
  }

  const authors = seriesInfo.authors
    ? JSON.parse(seriesInfo.authors).join(', ')
    : null;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link
          href="/series"
          className="p-2 rounded-lg bg-shelvarr-surface hover:bg-shelvarr-border transition-colors"
        >
          <BackIcon />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-white">{seriesInfo.seriesName}</h1>
          {authors && (
            <p className="text-shelvarr-text-muted mt-1">by {authors}</p>
          )}
        </div>
        <span className="ml-auto text-shelvarr-text-muted">
          {seriesInfo.bookCount} {seriesInfo.bookCount === 1 ? 'book' : 'books'}
        </span>
      </div>

      {books.length === 0 ? (
        <div className="bg-shelvarr-surface border border-shelvarr-border rounded-lg p-8 text-center">
          <p className="text-shelvarr-text-muted">No books found in this series.</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
          {books.map((book) => (
            <BookCard key={book.id} book={book} showSeriesNumber />
          ))}
        </div>
      )}
    </div>
  );
}

function BackIcon() {
  return (
    <svg className="w-5 h-5 text-shelvarr-text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
    </svg>
  );
}
