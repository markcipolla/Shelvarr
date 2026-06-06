import { NextRequest, NextResponse } from 'next/server';
import '@/lib/config';
import { getComicReadProgress, upsertComicReadProgress } from '@/lib/db';
import { validateApiAuth } from '@shelvarr/services';

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

  const row = getComicReadProgress(issueId);
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

  upsertComicReadProgress(
    issueId,
    body.page ?? 0,
    body.completed ?? false,
    body.total ?? null,
  );

  return NextResponse.json(getComicReadProgress(issueId));
}
