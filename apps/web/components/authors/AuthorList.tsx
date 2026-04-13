'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { getOrCreateAuthor } from '@/lib/actions/authors';

interface AuthorInfo {
  name: string;
  bookCount: number;
  authorId: number | null;
  hasMetadata: boolean;
}

interface AuthorListProps {
  authors: AuthorInfo[];
}

export function AuthorList({ authors }: AuthorListProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {authors.map((author) => (
        <AuthorCard key={author.name} author={author} />
      ))}
    </div>
  );
}

function AuthorCard({ author }: { author: AuthorInfo }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const handleClick = async () => {
    if (author.authorId) {
      router.push(`/authors/${author.authorId}`);
    } else {
      // Create author record first
      setLoading(true);
      const created = await getOrCreateAuthor(author.name);
      setLoading(false);
      router.push(`/authors/${created.id}`);
    }
  };

  return (
    <button
      onClick={handleClick}
      disabled={loading}
      className="block w-full text-left bg-shelvarr-surface border border-shelvarr-border rounded-lg p-4 hover:border-shelvarr-primary transition-colors disabled:opacity-50"
    >
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 bg-shelvarr-primary/20 rounded-full flex items-center justify-center text-shelvarr-primary font-semibold">
          {author.name.charAt(0).toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-medium text-white truncate">{author.name}</h3>
          <div className="flex items-center gap-2 text-sm text-shelvarr-text-muted">
            <span>{author.bookCount} {author.bookCount === 1 ? 'book' : 'books'} in library</span>
            {author.hasMetadata && (
              <span className="text-green-400">
                <CheckIcon />
              </span>
            )}
          </div>
        </div>
        <ChevronIcon />
      </div>
    </button>
  );
}

function CheckIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
    </svg>
  );
}

function ChevronIcon() {
  return (
    <svg className="w-5 h-5 text-shelvarr-text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
    </svg>
  );
}
