import { NextRequest, NextResponse } from 'next/server';
import '@/lib/config';
import { validateApiAuth, comicLibrary, queue } from '@shelvarr/services';

export const dynamic = 'force-dynamic';

/**
 * Scan a folder tree and propose a ComicVine match for each folder found.
 *
 * Runs as a background task: it makes one ComicVine search per folder, spaced
 * out to stay under the rate limit, so a large library takes minutes.
 */
export async function POST(request: NextRequest) {
  if (!validateApiAuth(request.headers)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    path?: string;
    maxGroups?: number;
  };
  if (!body.path) {
    return NextResponse.json({ error: 'path is required' }, { status: 400 });
  }

  if (!(await comicLibrary.isComicVineConfigured())) {
    return NextResponse.json({ error: 'No ComicVine API key configured' }, { status: 503 });
  }

  const { task, alreadyRunning } = queue.enqueueOnce('comic_library_import', {
    path: body.path,
    maxGroups: body.maxGroups,
  });

  return NextResponse.json({ task, alreadyRunning }, { status: 202 });
}

/**
 * Adopt the chosen folders. Each keeps the folder it is already in.
 *
 * Queued: every volume costs ComicVine requests out of an hourly budget, so a
 * large import runs past it and the task resumes itself once it rolls over.
 */
export async function PUT(request: NextRequest) {
  if (!validateApiAuth(request.headers)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    selections?: Array<{ folder: string; comicvineId: number }>;
    rootFolderId?: number;
  };

  if (!Array.isArray(body.selections) || body.selections.length === 0) {
    return NextResponse.json({ error: 'selections is required' }, { status: 400 });
  }

  const rootFolderId = body.rootFolderId ?? comicLibrary.listRootFolders()[0]?.id;
  if (rootFolderId === undefined) {
    return NextResponse.json({ error: 'No comic root folder configured' }, { status: 400 });
  }

  const { task, alreadyRunning } = queue.enqueueOnce('comic_library_apply', {
    selections: body.selections,
    rootFolderId,
  });

  return NextResponse.json({ task, alreadyRunning }, { status: 202 });
}
