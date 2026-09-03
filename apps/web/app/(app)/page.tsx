import Link from 'next/link';
import { getRecentBooks, getCurrentlyReadingBooks, getWantToReadBooks } from '@/lib/services/scanner';
import { getRecentComics, getInProgressComics } from '@/lib/actions/comics';
import { BookCard } from '@/components/books/BookGrid';
import { ComicCard } from '@/components/comics/ComicGrid';
import type { Book } from '@/types';
import type { ComicVolumeSummary } from '@shelvarr/types';
import type { InProgressComic } from '@/lib/db';

export const dynamic = 'force-dynamic';

const CURRENTLY_READING_LIMIT = 12;
const NEXT_UP_LIMIT = 12;
const RECENT_BOOKS_LIMIT = 12;
const RECENT_COMICS_LIMIT = 12;

export default async function HomePage() {
  const [currentlyReading, nextUp, recentBooks, comicsResult, inProgressComics] = await Promise.all([
    getCurrentlyReadingBooks(CURRENTLY_READING_LIMIT),
    getWantToReadBooks(NEXT_UP_LIMIT),
    getRecentBooks(RECENT_BOOKS_LIMIT),
    getRecentComics(RECENT_COMICS_LIMIT),
    getInProgressComics(CURRENTLY_READING_LIMIT),
  ]);

  const recentComics = comicsResult.volumes;

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-bold text-white">Home</h1>

      <HomeSection
        title="Currently Reading"
        empty="No books in progress. Open a book to start reading."
        isEmpty={currentlyReading.length === 0}
      >
        <BookRow books={currentlyReading} />
      </HomeSection>

      {nextUp.length > 0 && (
        <HomeSection
          title="Next Up"
          empty=""
          isEmpty={false}
        >
          <BookRow books={nextUp} />
        </HomeSection>
      )}

      {inProgressComics.length > 0 && (
        <HomeSection
          title="Currently Reading Comics"
          href="/comics"
          empty=""
          isEmpty={false}
        >
          <InProgressComicRow comics={inProgressComics} />
        </HomeSection>
      )}

      <HomeSection
        title="Recently Added Books"
        href="/books"
        empty="No books yet. Add a library and scan it to import books."
        isEmpty={recentBooks.length === 0}
      >
        <BookRow books={recentBooks} />
      </HomeSection>

      {recentComics.length > 0 && (
        <HomeSection
          title="Recently Added Comics"
          href="/comics"
          empty="No comics yet."
          isEmpty={false}
        >
          <ComicRow volumes={recentComics} />
        </HomeSection>
      )}
    </div>
  );
}

interface HomeSectionProps {
  title: string;
  href?: string;
  empty: string;
  isEmpty: boolean;
  children: React.ReactNode;
}

function HomeSection({ title, href, empty, isEmpty, children }: HomeSectionProps) {
  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-white">{title}</h2>
        {href && (
          <Link href={href} className="text-sm text-shelvarr-primary hover:underline">
            View all
          </Link>
        )}
      </div>
      {isEmpty ? (
        <div className="bg-shelvarr-surface border border-shelvarr-border rounded-lg p-6 text-center">
          <p className="text-shelvarr-text-muted text-sm">{empty}</p>
        </div>
      ) : (
        children
      )}
    </section>
  );
}

function BookRow({ books }: { books: Book[] }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7 gap-4">
      {books.map((book) => (
        <BookCard key={book.id} book={book} />
      ))}
    </div>
  );
}

function ComicRow({ volumes }: { volumes: ComicVolumeSummary[] }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7 gap-4">
      {volumes.map((volume) => (
        <ComicCard key={volume.id} volume={volume} />
      ))}
    </div>
  );
}

function InProgressComicRow({ comics }: { comics: InProgressComic[] }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7 gap-4">
      {comics.map((c) => (
        <ComicCard
          key={c.volume.id}
          volume={c.volume}
          progressLabel={c.issueNumber ? `Reading #${c.issueNumber}` : 'Reading'}
        />
      ))}
    </div>
  );
}
