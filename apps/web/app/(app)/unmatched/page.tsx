import { getBooks } from '@/lib/actions/books';
import { getLibraries } from '@/lib/actions/libraries';
import { getUnmatchedComics } from '@/lib/actions/comics';
import { BookGrid } from '@/components/books/BookGrid';
import { BooksFilter } from '@/components/books/BooksFilter';
import { Pagination } from '@/components/books/Pagination';
import { RefreshUnmatchedButton } from '@/components/books/RefreshUnmatchedButton';
import { ComicGrid } from '@/components/comics/ComicGrid';
import { LiveRefresh } from '@/components/live/LiveRefresh';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Unmatched' };

interface PageProps {
  searchParams: Promise<{
    page?: string;
    library?: string;
    search?: string;
  }>;
}

export default async function UnmatchedPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const page = parseInt(params.page || '1', 10);
  const libraryId = params.library ? parseInt(params.library, 10) : undefined;
  const search = params.search || '';

  const [booksResult, libraries, comicsResult] = await Promise.all([
    getBooks({ page, pageSize: 20, libraryId, search, unmatchedOnly: true }),
    getLibraries(),
    getUnmatchedComics(),
  ]);

  return (
    <div className="space-y-6">
      <LiveRefresh taskTypes={['scan', 'book_scan_all', 'metadata', 'book_metadata', 'comic_scan', 'comic_scan_all', 'comic_refresh']} />
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Unmatched</h1>
          <p className="text-shelvarr-text-muted mt-1">
            Items without metadata
          </p>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-shelvarr-text-muted">
            {booksResult.total + comicsResult.volumes.length} unmatched
          </span>
          {booksResult.total > 0 && <RefreshUnmatchedButton libraryId={libraryId} />}
        </div>
      </div>

      <BooksFilter
        libraries={libraries}
        currentLibrary={libraryId}
        currentSearch={search}
        baseUrl="/unmatched"
      />

      {booksResult.total === 0 && comicsResult.volumes.length === 0 ? (
        <div className="bg-shelvarr-surface border border-shelvarr-border rounded-lg p-8 text-center">
          <div className="text-green-400 mb-2">
            <svg className="w-12 h-12 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <p className="text-shelvarr-text-muted">
            {search || libraryId
              ? 'No unmatched items match your filters.'
              : 'All items have been matched with metadata!'}
          </p>
        </div>
      ) : (
        <>
          {booksResult.books.length > 0 && (
            <section className="space-y-4">
              <h2 className="text-lg font-semibold text-white">Books</h2>
              <BookGrid books={booksResult.books} />
              <Pagination
                currentPage={page}
                totalPages={booksResult.totalPages}
                baseUrl="/unmatched"
                searchParams={{ library: params.library, search: params.search }}
              />
            </section>
          )}
          {comicsResult.volumes.length > 0 && (
            <section className="space-y-4">
              <h2 className="text-lg font-semibold text-white">Comics</h2>
              <ComicGrid volumes={comicsResult.volumes} />
            </section>
          )}
        </>
      )}
    </div>
  );
}
