import { getAuthorsFromBooks } from '@/lib/actions/authors';
import { AuthorList } from '@/components/authors/AuthorList';
import { AuthorSearch } from '@/components/authors/AuthorSearch';

export const dynamic = 'force-dynamic';

interface PageProps {
  searchParams: Promise<{ search?: string }>;
}

export default async function AuthorsPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const authors = await getAuthorsFromBooks(params.search);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Authors</h1>
          <p className="text-shelvarr-text-muted mt-1">
            Track your collection by author
          </p>
        </div>
        <span className="text-shelvarr-text-muted">
          {authors.length} authors
        </span>
      </div>

      <AuthorSearch currentSearch={params.search || ''} />

      {authors.length === 0 ? (
        <div className="bg-shelvarr-surface border border-shelvarr-border rounded-lg p-8 text-center">
          <p className="text-shelvarr-text-muted">
            {params.search
              ? 'No authors match your search.'
              : 'No authors found. Import books with author metadata to see them here.'}
          </p>
        </div>
      ) : (
        <AuthorList authors={authors} />
      )}
    </div>
  );
}
