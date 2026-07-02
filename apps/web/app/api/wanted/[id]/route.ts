import { NextRequest, NextResponse } from 'next/server';
import '@/lib/config';
import { deleteWantedBook, updateWantedBook, getWantedBookById } from '@/lib/db';
import { validateApiAuth } from '@shelvarr/services';

export const dynamic = 'force-dynamic';

const VALID_STATUSES = ['wanted', 'searching', 'found', 'acquired'] as const;

interface PatchBody {
  status?: (typeof VALID_STATUSES)[number];
  priority?: number;
  notes?: string;
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!validateApiAuth(request.headers)) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  const numericId = Number(id);
  if (!Number.isInteger(numericId)) {
    return NextResponse.json({ success: false, error: 'Invalid id' }, { status: 400 });
  }

  const removed = deleteWantedBook(numericId);
  if (!removed) {
    return NextResponse.json({ success: false, error: 'Book not found' }, { status: 404 });
  }

  return NextResponse.json({ success: true });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!validateApiAuth(request.headers)) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  const numericId = Number(id);
  if (!Number.isInteger(numericId)) {
    return NextResponse.json({ success: false, error: 'Invalid id' }, { status: 400 });
  }

  let body: PatchBody;
  try {
    body = (await request.json()) as PatchBody;
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid JSON body' }, { status: 400 });
  }

  if (body.status && !VALID_STATUSES.includes(body.status)) {
    return NextResponse.json({ success: false, error: 'Invalid status' }, { status: 400 });
  }

  const updated = updateWantedBook(numericId, {
    status: body.status,
    priority: body.priority,
    notes: body.notes,
  });

  if (!updated) {
    return NextResponse.json(
      { success: false, error: 'Book not found or nothing to update' },
      { status: 404 }
    );
  }

  return NextResponse.json({ success: true, book: getWantedBookById(numericId) });
}
