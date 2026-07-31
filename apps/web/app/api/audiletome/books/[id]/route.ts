import { NextRequest, NextResponse } from 'next/server';
import '@/lib/config';
import { audiletomeClient, configureAudiletomeFromDb } from '@/lib/services/audiletome';
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

  const configured = await configureAudiletomeFromDb();
  if (!configured) {
    return NextResponse.json({ error: 'Audiletome not configured' }, { status: 503 });
  }

  try {
    const book = await audiletomeClient.getBook(id);
    return NextResponse.json(book);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[audiletome/books] getBook(${id}) failed: ${message}`);
    const upstream404 = /\b404\b/.test(message);
    return NextResponse.json({ error: message }, { status: upstream404 ? 404 : 502 });
  }
}
