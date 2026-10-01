import { getLibraries } from '@/lib/actions/libraries';
import { LibraryList } from '@/components/libraries/LibraryList';
import { AddLibraryButton } from '@/components/libraries/AddLibraryButton';
import { LiveRefresh } from '@/components/live/LiveRefresh';

export const dynamic = 'force-dynamic';

export default async function LibrariesPage() {
  const libraries = await getLibraries('all');

  return (
    <div className="space-y-6">
      {/* The count on each library is whatever the last scan found. */}
      <LiveRefresh taskTypes={[
          'scan',
          'book_scan_all',
          'organize',
          'book_organize_all',
          'comic_scan_all',
          'comic_rename_all',
        ]} />
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">Libraries</h1>
        <AddLibraryButton />
      </div>

      <LibraryList libraries={libraries} />
    </div>
  );
}
