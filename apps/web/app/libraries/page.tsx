import { getLibraries } from '@/lib/actions/libraries';
import { LibraryList } from '@/components/libraries/LibraryList';
import { AddLibraryButton } from '@/components/libraries/AddLibraryButton';

export const dynamic = 'force-dynamic';

export default async function LibrariesPage() {
  const libraries = await getLibraries();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">Libraries</h1>
        <AddLibraryButton />
      </div>

      <LibraryList libraries={libraries} />
    </div>
  );
}
