import Link from 'next/link';
import { getSeries } from '@/lib/actions/series';
import { SeriesSearch } from '@/components/series/SeriesSearch';
import { formatAuthors } from '@/lib/utils/authors';
import { SeriesIcon } from '@/components/ui/Icons';

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
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
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
  series: { seriesName: string; bookCount: number; authors: string | null };
}) {
  const authors = formatAuthors(series.authors);

  return (
    <Link
      href={`/series/${encodeURIComponent(series.seriesName)}`}
      className="block bg-shelvarr-surface border border-shelvarr-border rounded-lg p-4 hover:border-shelvarr-primary transition-colors"
    >
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 bg-shelvarr-primary/20 rounded-lg flex items-center justify-center text-shelvarr-primary">
          <SeriesIcon className="w-5 h-5" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-medium text-white truncate">{series.seriesName}</h3>
          {authors && (
            <p className="text-sm text-shelvarr-text-muted truncate">{authors}</p>
          )}
        </div>
        <span className="text-sm text-shelvarr-text-muted">
          {series.bookCount} {series.bookCount === 1 ? 'book' : 'books'}
        </span>
      </div>
    </Link>
  );
}
