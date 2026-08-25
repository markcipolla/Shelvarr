import Link from 'next/link';
import { getComicRootFoldersAction } from '@/lib/actions/comics';
import { AddComic } from '@/components/comics/AddComic';

export const dynamic = 'force-dynamic';

export default async function AddComicPage() {
  const rootFolders = await getComicRootFoldersAction();

  return (
    <div className="space-y-6">
      <Link href="/comics" className="text-shelvarr-text-muted hover:text-white text-sm inline-block">
        ← Back to Comics
      </Link>

      <div>
        <h1 className="text-2xl font-bold text-white">Add a comic</h1>
        <p className="text-shelvarr-text-muted mt-1">
          Search ComicVine, then Shelvarr tracks the volume and looks for its issues.
        </p>
      </div>

      <AddComic rootFolders={rootFolders} />
    </div>
  );
}
