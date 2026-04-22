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
      className="group block bg-shelvarr-surface border border-shelvarr-border rounded-lg overflow-hidden hover:border-shelvarr-primary transition-colors"
    >
      <div className="aspect-[2/3] bg-shelvarr-bg relative">
        {series.coverUrl ? (
          <img
            src={series.coverUrl}
            alt={series.seriesName}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center p-2">
            <SeriesIcon className="w-12 h-12 text-shelvarr-text-muted" />
          </div>
        )}
        <div className="absolute top-2 right-2 bg-shelvarr-primary/90 text-white text-xs font-bold px-2 py-1 rounded">
          {series.bookCount} {series.bookCount === 1 ? 'book' : 'books'}
        </div>
      </div>
      <div className="p-2">
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
