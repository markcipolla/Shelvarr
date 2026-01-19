import { NextRequest, NextResponse } from 'next/server';
import { readFileSync, existsSync } from 'fs';
import { getBook } from '@/lib/actions/books';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const bookId = parseInt(id, 10);

  if (isNaN(bookId)) {
    return NextResponse.json({ error: 'Invalid book ID' }, { status: 400 });
  }

  const book = await getBook(bookId);

  if (!book) {
    return NextResponse.json({ error: 'Book not found' }, { status: 404 });
  }

  if (!existsSync(book.filePath)) {
    return NextResponse.json({ error: 'File not found' }, { status: 404 });
  }

  // Only allow epub files for the reader
  if (!book.filePath.toLowerCase().endsWith('.epub')) {
    return NextResponse.json({ error: 'Only EPUB files can be read' }, { status: 400 });
  }

  try {
    const fileBuffer = readFileSync(book.filePath);

    return new NextResponse(fileBuffer, {
      headers: {
        'Content-Type': 'application/epub+zip',
        'Content-Disposition': `inline; filename="${encodeURIComponent(book.title || 'book')}.epub"`,
        'Cache-Control': 'private, max-age=3600',
      },
    });
  } catch (error) {
    console.error('Error reading file:', error);
    return NextResponse.json({ error: 'Failed to read file' }, { status: 500 });
  }
}
