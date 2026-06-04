import { NextRequest, NextResponse } from 'next/server';
import '@/lib/config';
import { addWantedBook, isBookWanted, getWantedBooks } from '@/lib/db';
import { validateApiAuth } from '@shelvarr/services';

export const dynamic = 'force-dynamic';

export function GET(request: NextRequest) {
  if (!validateApiAuth(request.headers)) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  const status = request.nextUrl.searchParams.get('status') || undefined;
  const books = getWantedBooks(status);
  return NextResponse.json({ success: true, books });
}

interface AddBody {
  hardcoverId?: string;
  title?: string;
  author?: string;
  isbn?: string;
  coverUrl?: string;
  description?: string;
  priority?: number;
  notes?: string;
}

export async function POST(request: NextRequest) {
  if (!validateApiAuth(request.headers)) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  let body: AddBody;
  try {
    body = (await request.json()) as AddBody;
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid JSON body' }, { status: 400 });
  }

  if (!body.title || !body.title.trim()) {
    return NextResponse.json({ success: false, error: 'title is required' }, { status: 400 });
  }

  if (isBookWanted(body.hardcoverId, body.isbn, body.title)) {
    return NextResponse.json(
      { success: false, error: 'Book is already on wanted list' },
      { status: 409 }
    );
  }

  const book = addWantedBook({
    hardcover_id: body.hardcoverId,
    title: body.title,
    author: body.author,
    isbn: body.isbn,
    cover_url: body.coverUrl,
    description: body.description,
    priority: body.priority || 0,
    notes: body.notes,
  });

  if (!book) {
    return NextResponse.json(
      { success: false, error: 'Failed to add book to wanted list' },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true, id: book.id });
}
