import { NextRequest, NextResponse } from 'next/server';
import '@/lib/config';
import { queryOne, getEpubProgression, upsertEpubProgression, upsertReadProgress } from '@/lib/db';
import { validateApiAuth } from '@shelvarr/services';
import { toEpubProgression } from '@shelvarr/services/komga-response';
import { syncReadingProgress } from '@/lib/services/metadata/hardcover';

export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!validateApiAuth(request.headers)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  const bookId = parseInt(id);
  const deviceId = request.nextUrl.searchParams.get('device_id') || 'default';

  const progression = getEpubProgression(bookId, deviceId);
  if (!progression) {
    return NextResponse.json(null);
  }

  return NextResponse.json(toEpubProgression(progression));
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!validateApiAuth(request.headers)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  const bookId = parseInt(id);
  const body = await request.json() as {
    deviceId?: string;
    locator: unknown;
    progression: number;
  };

  const book = queryOne<{ id: number; metadata_id: string | null; metadata_source: string | null }>(
    'SELECT id, metadata_id, metadata_source FROM books WHERE id = ?',
    [bookId]
  );
  if (!book) {
    return NextResponse.json({ error: 'Book not found' }, { status: 404 });
  }

  const deviceId = body.deviceId || 'default';
  const locator = typeof body.locator === 'string' ? body.locator : JSON.stringify(body.locator);

  upsertEpubProgression(bookId, deviceId, locator, body.progression);
  upsertReadProgress(bookId, 0, body.progression >= 0.98);

  // Fire-and-forget Hardcover sync — throttled per-book inside syncReadingProgress.
  if (book.metadata_id && book.metadata_source === 'hardcover') {
    void syncReadingProgress(book.metadata_id, body.progression).catch((err) => {
      console.error('Hardcover progress sync failed:', err);
    });
  }

  const result = getEpubProgression(bookId, deviceId);
  return NextResponse.json(toEpubProgression(result));
}
