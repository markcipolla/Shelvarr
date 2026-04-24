import { NextRequest, NextResponse } from 'next/server';
import '@/lib/config';
import { validateApiAuth } from '@shelvarr/services';
import { getSyncChangesSince } from '@/lib/db';

export const dynamic = 'force-dynamic';

/**
 * GET /api/sync?since=<iso8601>
 *
 * Returns comics, comic_issues, and books rows with updated_at > since
 * (or all rows if `since` is omitted/empty). Response also includes `now`
 * — the server's current timestamp — which the client should send back
 * as `since` on the next call.
 *
 * Soft-deleted rows are included with `deleted_at` set so the client
 * can tombstone its mirror.
 */
export async function GET(request: NextRequest) {
  if (!validateApiAuth(request.headers)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const since = request.nextUrl.searchParams.get('since') || null;

  if (since && !isValidIsoTimestamp(since)) {
    return NextResponse.json(
      { error: 'Invalid `since` parameter: must be ISO 8601 timestamp' },
      { status: 400 }
    );
  }

  const changes = getSyncChangesSince(since);
  return NextResponse.json(changes);
}

function isValidIsoTimestamp(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}/.test(value)) return false;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed);
}
