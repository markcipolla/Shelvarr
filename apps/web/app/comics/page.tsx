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
        <div className="flex items-center gap-4">
          <span className="text-shelvarr-text-muted">
            {result.volumes.length} {result.volumes.length === 1 ? 'volume' : 'volumes'}
          </span>
          <Link
            href="/comics/downloads"
            className="px-3 py-1.5 text-sm rounded-lg border border-shelvarr-border text-white hover:border-blue-500"
          >
            Downloads
          </Link>
          <Link
            href="/comics/add"
            className="px-3 py-1.5 text-sm rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-medium"
          >
            Add comic
          </Link>
        </div>
      </div>

      {result.volumes.length === 0 ? (
        <ComicEmptyState>
          {search ? (
            'No comics match your search.'
          ) : (
            <>
              No comics yet.{' '}
              <Link href="/comics/add" className="text-shelvarr-primary hover:underline">
                Add one
              </Link>
              , or{' '}
              <Link href="/settings/comics" className="text-shelvarr-primary hover:underline">
                import an existing library
              </Link>
              .
            </>
          )}
        </ComicEmptyState>
      ) : (
        <ComicGrid volumes={result.volumes} />
      )}
    </div>
  );
}
