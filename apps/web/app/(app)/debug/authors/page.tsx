import { query } from '@/lib/db';
import { getBooks } from '@/lib/actions/books';
import { getAuthorByName } from '@/lib/actions/authors';

export const dynamic = 'force-dynamic';

export default async function DebugAuthorsPage() {
  // Get author count
  const authorCount = query<{ count: number }>('SELECT COUNT(*) as count FROM authors', [])[0];

  // Get sample authors
  const authors = query<{ id: number; name: string }>(
    'SELECT id, name FROM authors LIMIT 10',
    []
  );

  // Get a sample book
  const { books } = await getBooks({ pageSize: 1 });
  const sampleBook = books[0];

  let sampleBookAuthors = null;
  let authorsWithIds = null;

  if (sampleBook?.authors) {
    try {
      sampleBookAuthors = JSON.parse(sampleBook.authors);

      // Fetch author IDs
      authorsWithIds = await Promise.all(
        sampleBookAuthors.map(async (name: string) => {
          const author = await getAuthorByName(name);
          return { name, id: author?.id || null };
        })
      );
    } catch {
      sampleBookAuthors = null;
    }
  }

  return (
    <div className="p-8 space-y-6 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold text-white">Author Debug Info</h1>

      <div className="bg-shelvarr-surface border border-shelvarr-border rounded-lg p-4">
        <h2 className="font-semibold text-white mb-2">Database Stats</h2>
        <p className="text-shelvarr-text-muted">
          Authors in database: <span className="text-white font-bold">{authorCount?.count || 0}</span>
        </p>
      </div>

      {authors.length > 0 && (
        <div className="bg-shelvarr-surface border border-shelvarr-border rounded-lg p-4">
          <h2 className="font-semibold text-white mb-2">Sample Authors</h2>
          <ul className="space-y-1">
            {authors.map((a) => (
              <li key={a.id} className="text-shelvarr-text-muted">
                ID: {a.id} - {a.name}
              </li>
            ))}
          </ul>
        </div>
      )}

      {sampleBook && (
        <div className="bg-shelvarr-surface border border-shelvarr-border rounded-lg p-4">
          <h2 className="font-semibold text-white mb-2">Sample Book</h2>
          <p className="text-white mb-2">
            <strong>Title:</strong> {sampleBook.title}
          </p>
          <p className="text-shelvarr-text-muted mb-2">
            <strong>Authors (raw JSON):</strong> {sampleBook.authors || 'null'}
          </p>
          {sampleBookAuthors && (
            <p className="text-shelvarr-text-muted mb-2">
              <strong>Authors (parsed):</strong> {sampleBookAuthors.join(', ')}
            </p>
          )}
          {authorsWithIds && (
            <div className="mt-3">
              <p className="text-white mb-2"><strong>Authors with IDs:</strong></p>
              <ul className="space-y-1">
                {authorsWithIds.map((a: { name: string; id: number | null }, i: number) => (
                  <li key={i} className="text-shelvarr-text-muted">
                    {a.name}: {a.id ? `ID ${a.id} ✓` : 'Not in database ✗'}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      <div className="bg-yellow-900/20 border border-yellow-600 rounded-lg p-4">
        <h2 className="font-semibold text-yellow-400 mb-2">⚠️ Troubleshooting</h2>
        <ol className="list-decimal list-inside space-y-2 text-shelvarr-text-muted">
          <li>
            If "Authors in database" is 0:
            <ul className="list-disc list-inside ml-6 mt-1">
              <li>Go to Libraries page</li>
              <li>Click "Find Missing" or "Refresh All"</li>
              <li>Wait for metadata task to complete</li>
            </ul>
          </li>
          <li>
            After running metadata fetch:
            <ul className="list-disc list-inside ml-6 mt-1">
              <li>Refresh this page to see updated counts</li>
              <li>Check if book authors now have IDs</li>
            </ul>
          </li>
          <li>
            If authors exist but links don't show:
            <ul className="list-disc list-inside ml-6 mt-1">
              <li>Make sure you restarted the dev server</li>
              <li>Hard refresh the book page (Ctrl+Shift+R)</li>
            </ul>
          </li>
        </ol>
      </div>

      <div className="text-center">
        <a
          href="/"
          className="text-shelvarr-primary hover:text-shelvarr-primary/80"
        >
          ← Back to Dashboard
        </a>
      </div>
    </div>
  );
}
