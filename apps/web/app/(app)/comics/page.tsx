import Link from 'next/link';
import { getComics } from '@/lib/actions/comics';
import { ComicGrid, ComicEmptyState } from '@/components/comics/ComicGrid';
import { SearchAllButton } from '@/components/comics/SearchAllButton';
import { SeriesSearch } from '@/components/series/SeriesSearch';
import { LiveRefresh } from '@/components/live/LiveRefresh';
import { DownloadsLink } from '@/components/downloads/DownloadsLink';
import { getActiveDownloadCounts } from '@/lib/actions/downloads';

export const dynamic = 'force-dynamic';

interface PageProps {
  searchParams: Promise<{
    search?: string;
  }>;
}

export default async function ComicsPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const search = params.search || '';

  const [result, activeDownloads] = await Promise.all([
    getComics(search || undefined),
    getActiveDownloadCounts(),
  ]);

  const issueCount = result.volumes.reduce((total, volume) => total + volume.issues_downloaded, 0);

  return (
    <div className="space-y-6">
      {/* Volumes arrive from an import and fill up from downloads and scans. */}
      <LiveRefresh
        taskTypes={[
          'comic_library_import',
          'comic_library_apply',
          'comic_scan',
          'comic_download',
          'comic_refresh',
          'comic_update_all',
          'comic_search_all',
        ]}
        downloads
      />
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">Comics</h1>
        <div className="flex items-center gap-4">
          <span className="text-shelvarr-text-muted">
            {result.volumes.length} {result.volumes.length === 1 ? 'volume' : 'volumes'}
            {' · '}
            {issueCount} {issueCount === 1 ? 'issue' : 'issues'}
          </span>
          <SearchAllButton />
          <DownloadsLink href="/comics/downloads" active={activeDownloads.comics} />
          <Link
            href="/comics/add"
            className="px-3 py-1.5 text-sm rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-medium"
          >
            Add comic
          </Link>
        </div>
      </div>

      <SeriesSearch currentSearch={search} basePath="/comics" placeholder="Search comics..." />

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
