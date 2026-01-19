'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Book } from '@/types';
import { deleteBook } from '@/lib/actions/books';
import { MetadataSearchModal } from '@/components/books/MetadataSearchModal';
import { useToast } from '@/components/ui/Toast';

interface BookActionsProps {
  book: Book;
}

function getFilenameFromPath(filePath: string): string {
  const parts = filePath.split(/[/\\]/);
  const filename = parts[parts.length - 1] || filePath;
  return filename.replace(/\.[^.]+$/, '');
}

export function BookActions({ book }: BookActionsProps) {
  const router = useRouter();
  const toast = useToast();
  const [loading, setLoading] = useState(false);
  const [showMetadataSearch, setShowMetadataSearch] = useState(false);

  const hasMatch = !!book.metadataSource;

  const handleDelete = async () => {
    if (!confirm('Delete this book from the database? The file will not be deleted.')) {
      return;
    }

    setLoading(true);
    const result = await deleteBook(book.id);
    setLoading(false);

    if (result.error) {
      toast.error(result.error);
    } else {
      toast.success('Book deleted');
      router.push('/books');
    }
  };

  return (
    <>
      <div className="space-y-2">
        <button
          onClick={() => setShowMetadataSearch(true)}
          disabled={loading}
          className="w-full bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium transition-colors disabled:opacity-50"
        >
          {hasMatch ? 'Fix Match' : 'Search Match'}
        </button>

        <button
          onClick={handleDelete}
          disabled={loading}
          className="w-full bg-shelvarr-surface hover:bg-red-900/20 text-red-400 border border-shelvarr-border px-4 py-2 rounded-lg font-medium transition-colors disabled:opacity-50"
        >
          {loading ? 'Deleting...' : 'Delete from Database'}
        </button>
      </div>

      {showMetadataSearch && (
        <MetadataSearchModal
          book={book}
          initialQuery={hasMatch ? getFilenameFromPath(book.filePath) : undefined}
          onClose={() => setShowMetadataSearch(false)}
        />
      )}
    </>
  );
}
