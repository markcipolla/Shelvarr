import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getCompleteSeriesInfo } from '@/lib/actions/series';
import { SeriesBookCard } from '@/components/series/SeriesBookCard';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ name: string }>;
}

export default async function SeriesDetailPage({ params }: PageProps) {
  const { name } = await params;
  const seriesName = decodeURIComponent(name);

  const seriesInfo = await getCompleteSeriesInfo(seriesName);

  if (!seriesInfo) {
    notFound();
  }

  const completionPercent = seriesInfo.totalBooks > 0
    ? Math.round((seriesInfo.ownedBooks / seriesInfo.totalBooks) * 100)
    : 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start gap-4">
        <Link
          href="/series"
          className="p-2 rounded-lg bg-shelvarr-surface hover:bg-shelvarr-border transition-colors mt-1"
        >
          <BackIcon />
        </Link>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-white">{seriesInfo.seriesName}</h1>
          <p className="text-shelvarr-text-muted mt-1">by {seriesInfo.authors}</p>
        </div>
        <div className="text-right">
          <div className="text-2xl font-bold text-white">
            {seriesInfo.ownedBooks}/{seriesInfo.totalBooks}
          </div>
          <div className="text-sm text-shelvarr-text-muted">books owned</div>
        </div>
      </div>

      {/* Progress bar */}
      <div className="bg-shelvarr-surface border border-shelvarr-border rounded-lg p-4">
        <div className="flex justify-between text-sm mb-2">
          <span className="text-shelvarr-text-muted">Collection Progress</span>
          <span className="text-white font-medium">{completionPercent}%</span>
        </div>
        <div className="h-3 bg-shelvarr-bg rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-blue-600 to-blue-400 rounded-full transition-all duration-500"
            style={{ width: `${completionPercent}%` }}
          />
        </div>
        <div className="flex justify-between text-xs text-shelvarr-text-muted mt-2">
          <span>{seriesInfo.ownedBooks} owned</span>
          <span>{seriesInfo.totalBooks - seriesInfo.ownedBooks} missing</span>
        </div>
      </div>

      {/* Legend */}
      <div className="flex gap-4 text-sm">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 bg-green-600 rounded" />
          <span className="text-shelvarr-text-muted">In Library</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 bg-yellow-600 rounded" />
          <span className="text-shelvarr-text-muted">Missing</span>
        </div>
      </div>

      {/* Books grid */}
      {seriesInfo.books.length === 0 ? (
        <div className="bg-shelvarr-surface border border-shelvarr-border rounded-lg p-8 text-center">
          <p className="text-shelvarr-text-muted">No books found in this series.</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
          {seriesInfo.books.map((book, index) => (
            <SeriesBookCard
              key={book.hardcoverId || book.libraryBookId || index}
              book={book}
            />
          ))}
        </div>
      )}

      {/* Info about Hardcover */}
      {seriesInfo.hardcoverSeriesId && (
        <div className="text-center text-xs text-shelvarr-text-muted">
          Series data from{' '}
          <a
            href={`https://hardcover.app/series/${seriesInfo.hardcoverSeriesId}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-400 hover:text-blue-300"
          >
            Hardcover
          </a>
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
