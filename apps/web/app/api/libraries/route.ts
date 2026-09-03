import { NextResponse } from 'next/server';
import '@/lib/config';
import { query } from '@/lib/db';
import { validateApiAuth } from '@shelvarr/services';
import { toApiLibrary } from '@shelvarr/services/api-response';

export const dynamic = 'force-dynamic';

export function GET(request: Request) {
  if (!validateApiAuth(request.headers)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const rows = query<{
    id: number;
    name: string;
    path: string;
    type: string | null;
    created_at: string;
  }>('SELECT * FROM libraries ORDER BY name');

  return NextResponse.json(rows.map(toApiLibrary));
}
