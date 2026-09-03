import { notFound } from 'next/navigation';
import Link from 'next/link';
import { getWantedBook } from '@/lib/actions/wanted';
import { getDownloadSourceStatuses } from '@/lib/actions/downloads';
import { WantedBookDetail } from './WantedBookDetail';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function WantedBookPage({ params }: PageProps) {
  const { id } = await params;
  const bookId = parseInt(id, 10);

  if (isNaN(bookId)) {
    notFound();
  }

  const [book, sourceStatuses] = await Promise.all([
    getWantedBook(bookId),
    getDownloadSourceStatuses(),
  ]);

  if (!book) {
    notFound();
  }

  return (
    <div className="p-6">
      <div className="mb-6">
        <Link
          href="/wanted"
          className="text-shelvarr-text-muted hover:text-white transition-colors inline-flex items-center gap-1"
        >
          <BackIcon />
          Back to Wanted List
        </Link>
      </div>

      <WantedBookDetail book={book} sourceStatuses={sourceStatuses} />
    </div>
  );
}

function BackIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
    </svg>
  );
}
