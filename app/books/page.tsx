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

export default async function BooksPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const page = parseInt(params.page || '1', 10);
  const libraryId = params.library ? parseInt(params.library, 10) : undefined;
  const search = params.search || '';

  const [booksResult, libraries] = await Promise.all([
    getBooks({ page, pageSize: 20, libraryId, search, matchedOnly: true }),
    getLibraries(),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">Books</h1>
        <span className="text-shelvarr-text-muted">
          {booksResult.total} total
        </span>
      </div>

      <BooksFilter
        libraries={libraries}
        currentLibrary={libraryId}
        currentSearch={search}
      />

      {booksResult.books.length === 0 ? (
        <div className="bg-shelvarr-surface border border-shelvarr-border rounded-lg p-8 text-center">
          <p className="text-shelvarr-text-muted">
            {search || libraryId
              ? 'No books match your filters.'
              : 'No books found. Add a library and scan it to import books.'}
          </p>
        </div>
      ) : (
        <>
          <BookGrid books={booksResult.books} />
          <Pagination
            currentPage={page}
            totalPages={booksResult.totalPages}
            baseUrl="/books"
            searchParams={{ library: params.library, search: params.search }}
          />
        </>
      )}
    </div>
  );
}
