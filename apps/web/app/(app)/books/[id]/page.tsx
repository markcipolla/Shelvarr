import { notFound } from 'next/navigation';
import Link from 'next/link';
import { getBook } from '@/lib/actions/books';
import { getLibraryById } from '@/lib/services/library';
import { getAuthorByName } from '@/lib/actions/authors';
import { BookDetails } from '@/components/books/BookDetails';
import { BookActions } from '@/components/books/BookActions';
import { formatAuthors, parseAuthors } from '@/lib/utils/authors';
import { BookCover } from '@/components/ui/BookCover';

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
          <BookCover
            src={book.coverUrl}
            title={book.title || 'Unknown'}
            author={formatAuthors(book.authors)}
            className="w-full max-w-[300px] mx-auto"
          />

          <BookActions book={book} />
        </div>

        <BookDetails book={book} library={library} authorsWithIds={authorsWithIds} />
      </div>
    </div>
  );
}
