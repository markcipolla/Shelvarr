import Link from 'next/link';
import { getSeries } from '@/lib/actions/series';
import { SeriesSearch } from '@/components/series/SeriesSearch';
import { formatAuthors } from '@/lib/utils/authors';
import { BookCover } from '@/components/ui/BookCover';

export const dynamic = 'force-dynamic';

interface PageProps {
  searchParams: Promise<{ search?: string }>;
}

export default async function SeriesPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const series = await getSeries(params.search);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Series</h1>
          <p className="text-shelvarr-text-muted mt-1">
            Books organized by series
          </p>
        </div>
        <span className="text-shelvarr-text-muted">
          {series.length} series
        </span>
      </div>

      <SeriesSearch currentSearch={params.search || ''} />

      {series.length === 0 ? (
        <div className="bg-shelvarr-surface border border-shelvarr-border rounded-lg p-8 text-center">
          <p className="text-shelvarr-text-muted">
            {params.search
              ? 'No series match your search.'
              : 'No series found. Books with series information will appear here.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-7 3xl:grid-cols-7 gap-4">
          {series.map((s) => (
            <SeriesCard key={s.seriesName} series={s} />
          ))}
        </div>
      )}
    </div>
  );
}

function SeriesCard({
  series,
}: {
  series: { seriesName: string; bookCount: number; authors: string | null; coverUrl?: string | null };
}) {
  const authors = formatAuthors(series.authors);

  return (
    <Link
      href={`/series/${encodeURIComponent(series.seriesName)}`}
      className="book-cover-trigger group block"
    >
      <BookCover src={series.coverUrl} title={series.seriesName} author={authors}>
        <div className="absolute top-2 right-2 bg-shelvarr-primary/90 text-white text-xs font-bold px-2 py-1 rounded">
          {series.bookCount} {series.bookCount === 1 ? 'book' : 'books'}
        </div>
      </BookCover>
      <div className="pt-3">
        <h3 className="text-sm font-medium text-white line-clamp-2 group-hover:text-shelvarr-primary transition-colors">
          {series.seriesName}
        </h3>
        {authors && (
          <p className="text-xs text-shelvarr-text-muted line-clamp-1 mt-0.5">{authors}</p>
        )}
      </div>
    </Link>
  );
}
