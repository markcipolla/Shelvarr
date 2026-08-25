import { NextRequest, NextResponse } from 'next/server';
import '@/lib/config';
import { validateApiAuth, comicLibrary } from '@shelvarr/services';
import { countVolumesInRootFolder } from '@/lib/db';
import { statfsSync } from 'fs';

export const dynamic = 'force-dynamic';

/** Root folders, with free space and how many volumes each holds. */
export async function GET(request: NextRequest) {
  if (!validateApiAuth(request.headers)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const folders = comicLibrary.listRootFolders().map((folder) => {
    let freeSpace: number | null = null;
    try {
      const stats = statfsSync(folder.path);
      freeSpace = Number(stats.bavail) * Number(stats.bsize);
    } catch {
      // Folder unreadable or gone; the UI shows this as unknown.
    }
    return { ...folder, freeSpace, volumeCount: countVolumesInRootFolder(folder.id) };
  });

  return NextResponse.json({ folders });
}

/** Register a root folder, creating the directory if needed. */
export async function POST(request: NextRequest) {
  if (!validateApiAuth(request.headers)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as { path?: string };
  if (!body.path) {
    return NextResponse.json({ error: 'path is required' }, { status: 400 });
  }

  try {
    return NextResponse.json({ folder: await comicLibrary.addRootFolder(body.path) }, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to add root folder' },
      { status: 400 }
    );
  }
}
