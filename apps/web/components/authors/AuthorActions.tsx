'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Author } from '@/types';
import { fetchAuthorMetadata, refreshAuthorOwnership } from '@/lib/actions/authors';
import { useToast } from '@/components/ui/Toast';

interface AuthorActionsProps {
  author: Author;
}

export function AuthorActions({ author }: AuthorActionsProps) {
  const router = useRouter();
  const toast = useToast();
  const [loading, setLoading] = useState<string | null>(null);

  const handleFetchBibliography = async () => {
    setLoading('fetch');
    const result = await fetchAuthorMetadata(author.id);
    setLoading(null);

    if (result.error) {
      toast.error(result.error);
    } else {
      toast.success(`Found ${result.worksFound} works`);
      router.refresh();
    }
  };

  const handleRefreshOwnership = async () => {
    setLoading('refresh');
    await refreshAuthorOwnership(author.id);
    setLoading(null);
    router.refresh();
  };

  return (
    <div className="space-y-2">
      <button
        onClick={handleFetchBibliography}
        disabled={loading !== null}
        className="w-full bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium transition-colors disabled:opacity-50"
      >
        {loading === 'fetch' ? 'Fetching...' : author.lastSynced ? 'Refresh Bibliography' : 'Fetch Bibliography'}
      </button>

      {author.lastSynced && (
        <button
          onClick={handleRefreshOwnership}
          disabled={loading !== null}
          className="w-full bg-shelvarr-surface hover:bg-shelvarr-border text-white border border-shelvarr-border px-4 py-2 rounded-lg font-medium transition-colors disabled:opacity-50"
        >
          {loading === 'refresh' ? 'Refreshing...' : 'Refresh Ownership'}
        </button>
      )}
    </div>
  );
}
