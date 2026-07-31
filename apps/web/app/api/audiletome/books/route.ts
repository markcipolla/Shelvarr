import { NextRequest, NextResponse } from 'next/server';
import '@/lib/config';
import { audiletomeClient, configureAudiletomeFromDb } from '@/lib/services/audiletome';
import { validateApiAuth } from '@shelvarr/services';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  if (!validateApiAuth(request.headers)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const configured = await configureAudiletomeFromDb();
  if (!configured) {
    return NextResponse.json({ error: 'Audiletome not configured' }, { status: 503 });
  }

  try {
    const books = await audiletomeClient.getBooks();
    return NextResponse.json(books);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[audiletome/books] list failed: ${message}`);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
