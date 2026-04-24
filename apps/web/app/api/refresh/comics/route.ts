import { NextRequest, NextResponse } from 'next/server';
import '@/lib/config';
import { validateApiAuth } from '@shelvarr/services';
import { refreshStaleComics } from '@/lib/refresh/comics';

export const dynamic = 'force-dynamic';

/**
 * POST /api/refresh/comics
 *
 * Refreshes cached Kapowarr volumes and the most stale detail records.
 * Intended to be called by a cron job or during app startup. Returns
 * counts of refreshed/tombstoned rows and per-volume error messages.
 */
export async function POST(request: NextRequest) {
  if (!validateApiAuth(request.headers)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const summary = await refreshStaleComics();
  return NextResponse.json(summary);
}
