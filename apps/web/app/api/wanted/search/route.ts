import { NextRequest, NextResponse } from 'next/server';
import '@/lib/config';
import { isBookWanted } from '@/lib/db';
import { validateApiAuth } from '@shelvarr/services';
import * as metadataService from '@/lib/services/metadata';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  if (!validateApiAuth(request.headers)) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  const query = (request.nextUrl.searchParams.get('q') || '').trim();
  if (!query) {
    return NextResponse.json({ success: true, results: [] });
  }

  if (!metadataService.isConfigured()) {
    return NextResponse.json({
      success: false,
      configured: false,
      error: 'Hardcover is not configured on this Shelvarr server',
    });
  }

  try {
    const results = await metadataService.searchBooks(query, { maxResults: 15 });
    const mapped = results.map((r) => ({
      hardcoverId: r.sourceId,
      title: r.title,
      author: r.authors,
      isbn: r.isbn,
      coverUrl: r.coverUrl,
      description: r.description,
      publishDate: r.publishDate,
      isWanted: isBookWanted(r.sourceId, r.isbn, r.title),
    }));
    return NextResponse.json({ success: true, configured: true, results: mapped });
  } catch (err) {
    return NextResponse.json({
      success: false,
      configured: true,
      error: err instanceof Error ? err.message : 'Search failed',
    });
  }
}
