import { NextRequest, NextResponse } from 'next/server';
import '@/lib/config';
import { validateApiAuth } from '@shelvarr/services';
import { searchAllSources, getSearchLinks } from '@/lib/services/downloads';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  if (!validateApiAuth(request.headers)) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  const query = (request.nextUrl.searchParams.get('q') || '').trim();
  if (!query) {
    return NextResponse.json({ success: true, results: [], links: getSearchLinks('') });
  }

  const isbn = request.nextUrl.searchParams.get('isbn')?.trim() || undefined;
  const links = getSearchLinks(query);

  try {
    const results = await searchAllSources(query, { isbn });
    return NextResponse.json({ success: true, results, links });
  } catch (err) {
    return NextResponse.json({
      success: false,
      links,
      error: err instanceof Error ? err.message : 'Search failed',
    });
  }
}
