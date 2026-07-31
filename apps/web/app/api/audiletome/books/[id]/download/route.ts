import { NextRequest, NextResponse } from 'next/server';
import '@/lib/config';
import { audiletomeClient, configureAudiletomeFromDb } from '@/lib/services/audiletome';

export const dynamic = 'force-dynamic';

/**
 * Stream a finished .m4b from audiletome. Not auth-gated so it can back a
 * plain browser download link; the upstream status is passed through — 409
 * while the book is still generating, 404 if the file is missing.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const configured = await configureAudiletomeFromDb();
  if (!configured) {
    return NextResponse.json({ error: 'Audiletome not configured' }, { status: 503 });
  }

  let upstream: Response;
  try {
    upstream = await audiletomeClient.downloadBook(id);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[audiletome/download] book ${id} failed: ${message}`);
    return NextResponse.json({ error: message }, { status: 502 });
  }

  if (!upstream.ok) {
    // Preserve the upstream meaning: 409 = not ready yet, 404 = file missing.
    const errorText = await upstream.text().catch(() => '');
    return NextResponse.json(
      { error: errorText || `Audiletome returned ${upstream.status}` },
      { status: upstream.status }
    );
  }

  const contentType = upstream.headers.get('content-type') || 'audio/mp4';
  const disposition =
    upstream.headers.get('content-disposition') ||
    `attachment; filename="audiletome-book-${id}.m4b"`;

  return new Response(upstream.body as ReadableStream | null, {
    headers: {
      'Content-Type': contentType,
      'Content-Disposition': disposition,
    },
  });
}
