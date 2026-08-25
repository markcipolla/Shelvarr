import { NextRequest, NextResponse } from 'next/server';
import '@/lib/config';
import { validateApiAuth, comicLibrary } from '@shelvarr/services';

export const dynamic = 'force-dynamic';

/** Remove a root folder. Refuses while volumes still live in it. */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!validateApiAuth(request.headers)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  const folderId = parseInt(id, 10);
  if (!Number.isFinite(folderId)) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  }

  try {
    comicLibrary.removeRootFolder(folderId);
    return NextResponse.json({ deleted: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to remove root folder';
    return NextResponse.json({ error: message }, { status: message.includes('not found') ? 404 : 409 });
  }
}
