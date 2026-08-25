import { NextRequest, NextResponse } from 'next/server';
import '@/lib/config';
import { validateApiAuth, comicLibrary } from '@shelvarr/services';

export const dynamic = 'force-dynamic';

/** Every volume Shelvarr owns, with its file counts. */
export async function GET(request: NextRequest) {
  if (!validateApiAuth(request.headers)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  return NextResponse.json({ volumes: comicLibrary.listVolumes() });
}

/**
 * Add a volume from ComicVine. Fetches its metadata and issues, creates the
 * folder, and scans for files already sitting there.
 */
export async function POST(request: NextRequest) {
  if (!validateApiAuth(request.headers)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    comicvineId?: number | string;
    rootFolderId?: number;
    monitored?: boolean;
    monitorNewIssues?: boolean;
    specialVersion?: string | null;
    folder?: string;
  };

  if (body.comicvineId === undefined) {
    return NextResponse.json({ error: 'comicvineId is required' }, { status: 400 });
  }

  const rootFolderId = body.rootFolderId ?? comicLibrary.listRootFolders()[0]?.id;
  if (rootFolderId === undefined) {
    return NextResponse.json(
      { error: 'No comic root folder configured; add one in settings first' },
      { status: 400 }
    );
  }

  try {
    const result = await comicLibrary.addVolume({
      comicvineId: body.comicvineId,
      rootFolderId,
      ...(body.monitored !== undefined ? { monitored: body.monitored } : {}),
      ...(body.monitorNewIssues !== undefined
        ? { monitorNewIssues: body.monitorNewIssues }
        : {}),
      ...(body.specialVersion !== undefined
        ? { specialVersion: body.specialVersion as never }
        : {}),
      ...(body.folder ? { folder: body.folder } : {}),
    });
    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to add volume';
    const notFound = message.includes('not found') || message.includes('No ComicVine volume');
    return NextResponse.json({ error: message }, { status: notFound ? 404 : 502 });
  }
}
