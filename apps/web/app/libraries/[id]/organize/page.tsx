import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getLibraryById } from '@/lib/services/library';
import {
  getOrganizeSettings,
  previewOrganizeForLibrary,
} from '@/lib/actions/settings';
import { OrganizePreview } from '@/components/libraries/OrganizePreview';

export const dynamic = 'force-dynamic';

export default async function OrganizePreviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const libraryId = Number(id);
  if (!Number.isFinite(libraryId)) notFound();

  const library = await getLibraryById(libraryId);
  if (!library) notFound();

  const [{ template }, preview] = await Promise.all([
    getOrganizeSettings(),
    previewOrganizeForLibrary(libraryId),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Organize: {library.name}</h1>
          <p className="text-shelvarr-text-muted mt-1">
            Preview proposed moves before committing.
          </p>
        </div>
        <Link
          href="/settings/organize"
          className="text-sm text-blue-400 hover:text-blue-300"
        >
          Edit template
        </Link>
      </div>

      <div className="text-xs text-shelvarr-text-muted">
        Template: <code className="font-mono">{template}</code>
      </div>

      <OrganizePreview libraryId={libraryId} preview={preview} />
    </div>
  );
}
