import { NextRequest, NextResponse } from 'next/server';
import '@/lib/config';
import { getNextUpComics } from '@/lib/db';
import { validateApiAuth, getReadingUserId } from '@shelvarr/services';

export const dynamic = 'force-dynamic';

const DEFAULT_LIMIT = 20;

export async function GET(request: NextRequest) {
  if (!validateApiAuth(request.headers)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const limitParam = new URL(request.url).searchParams.get('limit');
  const parsed = limitParam ? parseInt(limitParam, 10) : DEFAULT_LIMIT;
  const limit = Number.isFinite(parsed) ? parsed : DEFAULT_LIMIT;

  return NextResponse.json({
    comics: getNextUpComics(getReadingUserId(request.headers), limit),
  });
}
