import { NextRequest, NextResponse } from 'next/server';
import { readdirSync, statSync, type Dirent } from 'fs';
import { resolve, join, dirname } from 'path';
import config from '@/lib/config';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const requestedPath = searchParams.get('path') || config.libraryRoot || '/';

    // Resolve to absolute path
    let absPath = resolve(requestedPath);

    // Check if path exists and is a directory, fall back to root if not
    let stats;
    try {
      stats = statSync(absPath);
      if (!stats.isDirectory()) {
        absPath = '/';
        stats = statSync(absPath);
      }
    } catch {
      absPath = '/';
      try {
        stats = statSync(absPath);
      } catch {
        return NextResponse.json({ error: 'Path not found' }, { status: 404 });
      }
    }

    if (!stats.isDirectory()) {
      return NextResponse.json({ error: 'Path is not a directory' }, { status: 400 });
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
