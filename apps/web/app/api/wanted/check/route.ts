import { NextRequest, NextResponse } from 'next/server';
import '@/lib/config';
import { isBookWanted } from '@/lib/db';
import { validateApiAuth } from '@shelvarr/services';

export const dynamic = 'force-dynamic';

interface CheckBody {
  hardcoverId?: string;
  isbn?: string;
  title?: string;
}

export async function POST(request: NextRequest) {
  if (!validateApiAuth(request.headers)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: CheckBody;
  try {
    body = (await request.json()) as CheckBody;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const wanted = isBookWanted(body.hardcoverId, body.isbn, body.title);
  return NextResponse.json({ isWanted: wanted });
}
