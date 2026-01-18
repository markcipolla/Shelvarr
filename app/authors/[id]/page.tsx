import { notFound } from 'next/navigation';
import Link from 'next/link';
import { getAuthor, getAuthorWorks, getOwnedBooksByAuthor } from '@/lib/actions/authors';
import { AuthorBibliography } from '@/components/authors/AuthorBibliography';
import { AuthorActions } from '@/components/authors/AuthorActions';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function AuthorDetailPage({ params }: PageProps) {
  const { id } = await params;
  const authorId = parseInt(id, 10);

  if (isNaN(authorId)) {
    notFound();
  }

  const author = await getAuthor(authorId);

  if (!author) {
    notFound();
  }

  const [works, ownedBooks] = await Promise.all([
    getAuthorWorks(authorId),
    getOwnedBooksByAuthor(author.name),
  ]);

  const ownedCount = works.filter(w => w.owned).length;
  const totalWorks = works.length;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 text-sm text-shelvarr-text-muted">
        <Link href="/authors" className="hover:text-white transition-colors">
          Authors
        </Link>
        <span>/</span>
        <span className="text-white">{author.name}</span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[300px_1fr] gap-6">
        <div className="space-y-4">
          <div className="bg-shelvarr-surface border border-shelvarr-border rounded-lg p-6">
            <div className="w-20 h-20 bg-shelvarr-primary/20 rounded-full flex items-center justify-center text-shelvarr-primary text-3xl font-semibold mx-auto mb-4">
              {author.name.charAt(0).toUpperCase()}
            </div>
            <h1 className="text-xl font-bold text-white text-center">{author.name}</h1>

            {author.openlibraryId && (
              <p className="text-sm text-shelvarr-text-muted text-center mt-2">
                OpenLibrary: {author.openlibraryId}
              </p>
            )}

            <div className="mt-4 pt-4 border-t border-shelvarr-border">
              <div className="grid grid-cols-2 gap-4 text-center">
                <div>
                  <div className="text-2xl font-bold text-white">{ownedBooks.length}</div>
                  <div className="text-xs text-shelvarr-text-muted">In Library</div>
                </div>
                <div>
                  <div className="text-2xl font-bold text-white">{totalWorks}</div>
                  <div className="text-xs text-shelvarr-text-muted">Known Works</div>
                </div>
              </div>
              {totalWorks > 0 && (
                <div className="mt-4">
                  <div className="flex justify-between text-xs text-shelvarr-text-muted mb-1">
                    <span>Collection Progress</span>
                    <span>{Math.round((ownedCount / totalWorks) * 100)}%</span>
                  </div>
                  <div className="h-2 bg-shelvarr-bg rounded-full overflow-hidden">
                    <div
                      className="h-full bg-green-500 transition-all"
                      style={{ width: `${(ownedCount / totalWorks) * 100}%` }}
                    />
                  </div>
                </div>
              )}
            </div>

            {author.lastSynced && (
              <p className="text-xs text-shelvarr-text-muted text-center mt-4">
                Last synced: {new Date(author.lastSynced).toLocaleDateString()}
              </p>
            )}
          </div>

          <AuthorActions author={author} />
        </div>

        <div className="bg-shelvarr-surface border border-shelvarr-border rounded-lg p-6">
          <h2 className="text-lg font-semibold text-white mb-4">Bibliography</h2>

          {works.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-shelvarr-text-muted mb-4">
                No bibliography fetched yet. Click "Fetch Bibliography" to get the author's works from OpenLibrary.
              </p>
            </div>
          ) : (
            <AuthorBibliography works={works} authorName={author.name} />
          )}
        </div>
      </div>
    </div>
  );
}
