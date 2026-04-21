import Link from 'next/link';
import { getComics } from '@/lib/actions/comics';
import { ComicGrid, ComicEmptyState } from '@/components/comics/ComicGrid';

export const dynamic = 'force-dynamic';

interface PageProps {
  searchParams: Promise<{
    search?: string;
  }>;
}

export default async function ComicsPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const search = params.search || '';

  const result = await getComics(search || undefined);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">Comics</h1>
        {result.configured && (
          <span className="text-shelvarr-text-muted">
            {result.volumes.length} {result.volumes.length === 1 ? 'volume' : 'volumes'}
          </span>
        )}
      </div>

      {!result.configured ? (
        <ComicEmptyState>
          Kapowarr is not configured.{' '}
          <Link href="/settings/kapowarr" className="text-shelvarr-primary hover:underline">
            Configure Kapowarr
          </Link>{' '}
          to browse comics.
        </ComicEmptyState>
      ) : result.error ? (
        <div className="bg-red-600/20 text-red-400 border border-red-500/40 rounded-lg p-4">
          {result.error}
        </div>
      ) : result.volumes.length === 0 ? (
        <ComicEmptyState>
          {search ? 'No comics match your search.' : 'No comics found in Kapowarr.'}
        </ComicEmptyState>
      ) : (
        <ComicGrid volumes={result.volumes} />
      )}
    </div>
  );
}
