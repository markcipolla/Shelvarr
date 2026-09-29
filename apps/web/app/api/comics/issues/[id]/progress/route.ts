import { NextRequest, NextResponse } from 'next/server';
import '@/lib/config';
import { getComicReadProgress, upsertComicReadProgress } from '@/lib/db';
import { validateApiAuth, getReadingUserId } from '@shelvarr/services';

export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!validateApiAuth(request.headers)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  const issueId = parseInt(id, 10);
  if (!Number.isFinite(issueId)) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  }

  const row = getComicReadProgress(getReadingUserId(request.headers), issueId);
  return NextResponse.json(row ?? null);
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!validateApiAuth(request.headers)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  const issueId = parseInt(id, 10);
  if (!Number.isFinite(issueId)) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  }

  const body = await request.json() as { page?: number; completed?: boolean; total?: number };

  const userId = getReadingUserId(request.headers);
  // A client that leaves a field out is saying nothing about it, not zero.
  //
  // A client that only says "completed" — the "×" on the home shelf, the Mark
  // read button on the volume page — keeps whatever page was saved. Writing 0
  // over it would lose the reader's place in that issue for good.
  //
  // And a client that only says "page" — the reader, turning pages — keeps
  // whatever "completed" was. Defaulting it to false let a page save un-finish
  // an issue somebody had marked read, which put the volume straight back on
  // Currently Reading Comics. Only an explicit `completed: false` clears it.
  const saved = getComicReadProgress(userId, issueId);
  upsertComicReadProgress(
    userId,
    issueId,
    body.page ?? saved?.page ?? 0,
    body.completed ?? saved?.completed === 1,
    body.total ?? null,
  );

  return NextResponse.json(getComicReadProgress(userId, issueId));
}
