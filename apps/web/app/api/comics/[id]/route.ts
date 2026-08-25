import { NextRequest, NextResponse } from 'next/server';
import '@/lib/config';
import { validateApiAuth, comicLibrary } from '@shelvarr/services';
import { getCachedComicDetail, getManagedComicDetail } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!validateApiAuth(request.headers)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  const volumeId = parseInt(id, 10);
  if (!Number.isFinite(volumeId)) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  }

  // Managed volumes are Shelvarr's own. Anything else is a leftover mirror
  // from a previous manager, readable until it has been migrated.
  const volume = getManagedComicDetail(volumeId) ?? getCachedComicDetail(volumeId);
  if (!volume) {
    return NextResponse.json({ error: 'Comic not found' }, { status: 404 });
  }

  return NextResponse.json({ volume, managed: getManagedComicDetail(volumeId) !== null });
}

/** Remove a volume from the library, optionally taking its files with it. */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!validateApiAuth(request.headers)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  const volumeId = parseInt(id, 10);
  if (!Number.isFinite(volumeId)) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  }

  const deleteFiles = request.nextUrl.searchParams.get('deleteFiles') === 'true';

  try {
    await comicLibrary.deleteVolume(volumeId, { deleteFiles });
    return NextResponse.json({ deleted: true, deletedFiles: deleteFiles });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to delete volume';
    return NextResponse.json({ error: message }, { status: message.includes('not found') ? 404 : 500 });
  }
}
