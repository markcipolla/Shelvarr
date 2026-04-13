import { NextResponse } from 'next/server';
import '@/lib/config';
import { queryOne } from '@/lib/db';
import { validateApiAuth } from '@shelvarr/services';

export const dynamic = 'force-dynamic';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!validateApiAuth(request.headers)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  const row = queryOne<{ cover_url: string | null }>('SELECT cover_url FROM books WHERE id = ?', [id]);

  if (row?.cover_url) {
    return NextResponse.redirect(row.cover_url);
  }

  return NextResponse.json({ error: 'Not found' }, { status: 404 });
}
