import Link from 'next/link';
import {
  getComicRootFoldersAction,
  getLatestLibraryImport,
} from '@/lib/actions/comics';
import { LibraryImportReview } from '@/components/comics/LibraryImportReview';

export const dynamic = 'force-dynamic';

export default async function LibraryImportPage() {
  const [run, rootFolders] = await Promise.all([
    getLatestLibraryImport(),
    getComicRootFoldersAction(),
  ]);

  return (
    <div className="space-y-6">
      <Link href="/comics" className="text-shelvarr-text-muted hover:text-white text-sm inline-block">
        ← Back to Comics
      </Link>

      <div>
        <h1 className="text-2xl font-bold text-white">Import an existing library</h1>
        <p className="text-shelvarr-text-muted mt-1">
          Confirm which ComicVine volume each folder is, then Shelvarr takes them over.
        </p>
      </div>

      <LibraryImportReview run={run} rootFolders={rootFolders} />
    </div>
  );
}
