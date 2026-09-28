import Link from 'next/link';
import {
  getComicRootFoldersAction,
  getLatestLibraryImport,
  getLatestLibraryImportApply,
} from '@/lib/actions/comics';
import { LibraryImportReview } from '@/components/comics/LibraryImportReview';
import { LiveRefresh } from '@/components/live/LiveRefresh';

export const dynamic = 'force-dynamic';

export default async function LibraryImportPage() {
  const [run, apply, rootFolders] = await Promise.all([
    getLatestLibraryImport(),
    getLatestLibraryImportApply(),
    getComicRootFoldersAction(),
  ]);

  return (
    <div className="space-y-6">
      {/* The scan's proposals and the import's progress both move on their own. */}
      <LiveRefresh taskTypes={['comic_library_import', 'comic_library_apply']} />
      <Link href="/comics" className="text-shelvarr-text-muted hover:text-white text-sm inline-block">
        ← Back to Comics
      </Link>

      <div>
        <h1 className="text-2xl font-bold text-white">Import an existing library</h1>
        <p className="text-shelvarr-text-muted mt-1">
          Confirm which ComicVine volume each folder is, then Shelvarr takes them over.
        </p>
      </div>

      <LibraryImportReview run={run} apply={apply} rootFolders={rootFolders} />
    </div>
  );
}
