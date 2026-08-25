import { NextRequest, NextResponse } from 'next/server';
import '@/lib/config';
import { validateApiAuth } from '@shelvarr/services';
import {
  addToComicBlocklist,
  clearComicBlocklist,
  getComicBlocklist,
  removeFromComicBlocklist,
} from '@/lib/db';

export const dynamic = 'force-dynamic';

/** Links that failed and won't be retried. */
export async function GET(request: NextRequest) {
  if (!validateApiAuth(request.headers)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  return NextResponse.json({ entries: getComicBlocklist() });
}

/** Blocklist a link by hand — for a mirror that "works" but yields junk. */
export async function POST(request: NextRequest) {
  if (!validateApiAuth(request.headers)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    downloadLink?: string;
    volumeId?: number;
  };
  if (!body.downloadLink) {
    return NextResponse.json({ error: 'downloadLink is required' }, { status: 400 });
  }

  addToComicBlocklist({
    downloadLink: body.downloadLink,
    reason: 'added-by-user',
    volumeId: body.volumeId ?? null,
  });

  return NextResponse.json({ added: true }, { status: 201 });
}

/** Remove one entry (`?id=`) or empty the blocklist entirely. */
export async function DELETE(request: NextRequest) {
  if (!validateApiAuth(request.headers)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const idParam = request.nextUrl.searchParams.get('id');
  if (idParam) {
    const id = parseInt(idParam, 10);
    if (!Number.isFinite(id)) {
      return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
    }
    return NextResponse.json({ removed: removeFromComicBlocklist(id) });
  }

  return NextResponse.json({ removed: clearComicBlocklist() });
}
