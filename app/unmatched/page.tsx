import { getBooks } from '@/lib/actions/books';
import { getLibraries } from '@/lib/actions/libraries';
import { BookGrid } from '@/components/books/BookGrid';
import { BooksFilter } from '@/components/books/BooksFilter';
import { Pagination } from '@/components/books/Pagination';

export const dynamic = 'force-dynamic';

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

  const [booksResult, libraries] = await Promise.all([
    getBooks({ page, pageSize: 20, libraryId, search, unmatchedOnly: true }),
    getLibraries(),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Unmatched Books</h1>
          <p className="text-shelvarr-text-muted mt-1">
            Books without metadata from Hardcover
          </p>
        </div>
        <span className="text-shelvarr-text-muted">
          {booksResult.total} unmatched
        </span>
      </div>

      <BooksFilter
        libraries={libraries}
        currentLibrary={libraryId}
        currentSearch={search}
        baseUrl="/unmatched"
      />

      {booksResult.books.length === 0 ? (
        <div className="bg-shelvarr-surface border border-shelvarr-border rounded-lg p-8 text-center">
          <div className="text-green-400 mb-2">
            <svg className="w-12 h-12 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <p className="text-shelvarr-text-muted">
            {search || libraryId
              ? 'No unmatched books match your filters.'
              : 'All books have been matched with metadata!'}
          </p>
        </div>
      ) : (
        <>
          <BookGrid books={booksResult.books} />
          <Pagination
            currentPage={page}
            totalPages={booksResult.totalPages}
            baseUrl="/unmatched"
            searchParams={{ library: params.library, search: params.search }}
          />
        </>
      )}
    </div>
  );
}
