import { NextRequest, NextResponse } from 'next/server';
import '@/lib/config';
import { validateApiAuth, comicLibrary } from '@shelvarr/services';

export const dynamic = 'force-dynamic';

/**
 * Search ComicVine for a volume to add. Results are flagged with the local
 * volume id when they're already in the library.
 */
export async function GET(request: NextRequest) {
  if (!validateApiAuth(request.headers)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const query = request.nextUrl.searchParams.get('q')?.trim();
  if (!query) {
    return NextResponse.json({ error: 'q is required' }, { status: 400 });
  }

  if (!(await comicLibrary.isComicVineConfigured())) {
    return NextResponse.json(
      { error: 'No ComicVine API key configured', configured: false },
      { status: 503 }
    );
  }

  try {
    return NextResponse.json({ configured: true, results: await comicLibrary.searchComicVine(query) });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'ComicVine search failed';
    const rateLimited = message.includes('rate limit');
    return NextResponse.json({ error: message }, { status: rateLimited ? 429 : 502 });
  }
}
