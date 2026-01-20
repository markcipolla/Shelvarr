import { notFound } from 'next/navigation';
import Link from 'next/link';
import { getBook } from '@/lib/actions/books';
import { getLibraryById } from '@/lib/services/library';
import { getAuthorByName } from '@/lib/actions/authors';
import { BookDetails } from '@/components/books/BookDetails';
import { BookActions } from '@/components/books/BookActions';
import { parseAuthors } from '@/lib/utils/authors';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function BookDetailPage({ params }: PageProps) {
  const { id } = await params;
  const bookId = parseInt(id, 10);

  if (isNaN(bookId)) {
    notFound();
  }

  const book = await getBook(bookId);

  if (!book) {
    notFound();
  }

  const library = book.libraryId ? await getLibraryById(book.libraryId) : null;

  // Fetch author IDs for linking
  const authorNames = parseAuthors(book.authors);
  const authorsWithIds = await Promise.all(
    authorNames.map(async (name: string) => {
      const author = await getAuthorByName(name);
      return { name, id: author?.id || null };
    })
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 text-sm text-shelvarr-text-muted">
        <Link href="/books" className="hover:text-white transition-colors">
          Books
        </Link>
        <span>/</span>
        <span className="text-white">{book.title || 'Unknown'}</span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[300px_1fr] gap-6">
        <div className="space-y-4">
          <div className="bg-shelvarr-surface border border-shelvarr-border rounded-lg overflow-hidden">
            <div className="aspect-[2/3] bg-shelvarr-bg">
              {book.coverUrl ? (
                <img
                  src={book.coverUrl}
                  alt={book.title || 'Book cover'}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <BookIcon />
                </div>
              )}
            </div>
          </div>

          <BookActions book={book} />
        </div>

        <BookDetails book={book} library={library} authorsWithIds={authorsWithIds} />
      </div>
    </div>
  );
}

function BookIcon() {
  return (
    <svg
      className="w-24 h-24 text-shelvarr-text-muted"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.5}
        d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"
      />
    </svg>
  );
}
