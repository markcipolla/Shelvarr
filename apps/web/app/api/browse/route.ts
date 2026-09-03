import { NextRequest, NextResponse } from 'next/server';
import { readdirSync, statSync, type Dirent } from 'fs';
import { resolve, join, dirname } from 'path';
import config from '@/lib/config';
import { validateApiAuth } from '@shelvarr/services';

/**
 * The deepest existing directory at or above `startPath`. A half-typed path
 * lands the folder picker as close to where the user was aiming as possible,
 * rather than dumping them back at `/`.
 */
function nearestExistingDirectory(startPath: string): string | null {
  let current = startPath;

  for (;;) {
    try {
      if (statSync(current).isDirectory()) return current;
    } catch {
      // Doesn't exist (or isn't readable) — try the parent.
    }

    const parent = dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}

export async function GET(request: NextRequest) {
  if (!validateApiAuth(request.headers)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const searchParams = request.nextUrl.searchParams;
    const requestedPath = searchParams.get('path') || config.libraryRoot || '/';

    const absPath = nearestExistingDirectory(resolve(requestedPath));
    if (!absPath) {
      return NextResponse.json({ error: 'Path not found' }, { status: 404 });
    }

    // List directory contents
    const entries: Dirent[] = readdirSync(absPath, { withFileTypes: true });
    const directories = entries
      .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.'))
      .map((entry) => ({
        name: entry.name,
        path: join(absPath, entry.name),
      }))
      .sort((a, b) => a.name.localeCompare(b.name));

    return NextResponse.json({
      current: absPath,
      parent: absPath !== '/' ? dirname(absPath) : null,
      directories,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
