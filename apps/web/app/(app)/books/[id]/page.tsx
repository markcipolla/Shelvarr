import { notFound } from 'next/navigation';
import Link from 'next/link';
import { getBook } from '@/lib/actions/books';
import { getLibraryById } from '@/lib/services/library';
import { getAuthorByName } from '@/lib/actions/authors';
import { BookDetails } from '@/components/books/BookDetails';
import { BookActions } from '@/components/books/BookActions';
import { parseAuthors } from '@/lib/utils/authors';
import { BookIcon } from '@/components/ui/Icons';

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
                  <BookIcon className="w-24 h-24 text-shelvarr-text-muted" />
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
