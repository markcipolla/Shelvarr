/**
 * Bookmarks and highlights for one book.
 *
 * Per user, and — like reader preferences and unlike progression — not per
 * device: a passage you highlighted on the sofa should be waiting on the
 * train. A CFI is opaque here; only the reader knows how to resolve one.
 */

import { NextResponse } from 'next/server';
import '@/lib/config';
import {
  queryOne,
  getReaderAnnotations,
  addReaderAnnotation,
  deleteReaderAnnotation,
  sqlTimeToIso,
} from '@/lib/db';
import type { ReaderAnnotationKind, ReaderAnnotationRow } from '@/lib/db';
import { validateApiAuth, getReadingUserId } from '@shelvarr/services';

export const dynamic = 'force-dynamic';

const KINDS: ReaderAnnotationKind[] = ['bookmark', 'highlight'];

function toAnnotation(row: ReaderAnnotationRow) {
  return {
    id: row.id,
    bookId: row.book_id,
    kind: row.kind,
    cfi: row.cfi,
    text: row.text,
    colour: row.colour,
    created: sqlTimeToIso(row.created_at),
  };
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!validateApiAuth(request.headers)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  const bookId = parseInt(id);
  if (!Number.isFinite(bookId)) {
    return NextResponse.json({ error: 'Invalid book id' }, { status: 400 });
  }

  const userId = getReadingUserId(request.headers);
  return NextResponse.json(getReaderAnnotations(userId, bookId).map(toAnnotation));
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!validateApiAuth(request.headers)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  const bookId = parseInt(id);
  if (!Number.isFinite(bookId)) {
    return NextResponse.json({ error: 'Invalid book id' }, { status: 400 });
  }

  const body = (await request.json().catch(() => null)) as {
    kind?: string;
    cfi?: string;
    text?: string | null;
    colour?: string | null;
  } | null;

  const kind = KINDS.find((k) => k === body?.kind);
  if (!kind) {
    return NextResponse.json({ error: 'kind must be bookmark or highlight' }, { status: 400 });
  }
  if (!body?.cfi) {
    return NextResponse.json({ error: 'cfi is required' }, { status: 400 });
  }

  if (!queryOne<{ id: number }>('SELECT id FROM books WHERE id = ?', [bookId])) {
    return NextResponse.json({ error: 'Book not found' }, { status: 404 });
  }

  const userId = getReadingUserId(request.headers);
  const row = addReaderAnnotation(
    userId,
    bookId,
    kind,
    body.cfi,
    body.text ?? null,
    body.colour ?? null
  );
  if (!row) {
    return NextResponse.json({ error: 'Failed to save annotation' }, { status: 500 });
  }
  return NextResponse.json(toAnnotation(row), { status: 201 });
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!validateApiAuth(request.headers)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  const bookId = parseInt(id);
  const annotationId = parseInt(new URL(request.url).searchParams.get('annotationId') ?? '');
  if (!Number.isFinite(bookId) || !Number.isFinite(annotationId)) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  }

  const userId = getReadingUserId(request.headers);
  if (!deleteReaderAnnotation(userId, bookId, annotationId)) {
    return NextResponse.json({ error: 'Annotation not found' }, { status: 404 });
  }
  return NextResponse.json({ deleted: true });
}
