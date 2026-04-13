import { NextResponse } from 'next/server';
import { query, execute } from '@/lib/db';
import { komgaClient } from '@/lib/services/komga';
import path from 'path';

export async function POST() {
  if (!komgaClient.isConfigured()) {
    return NextResponse.json({ error: 'Komga not configured' }, { status: 400 });
  }

  const books = query<{
    id: number;
    file_path: string;
  }>(
    'SELECT id, file_path FROM books WHERE komga_book_id IS NULL AND file_path IS NOT NULL'
  );

  let matched = 0;
  let failed = 0;
  const errors: string[] = [];

  for (const book of books) {
    try {
      const filename = path.basename(book.file_path);
      const komgaBook = await komgaClient.findBookByFilename(filename);

      if (komgaBook) {
        execute(
          'UPDATE books SET komga_book_id = ? WHERE id = ?',
          [komgaBook.id, book.id]
        );
        matched++;
      }
    } catch (err) {
      failed++;
      errors.push(`Book ${book.id}: ${err instanceof Error ? err.message : 'unknown error'}`);
    }
  }

  return NextResponse.json({
    total: books.length,
    matched,
    failed,
    errors: errors.slice(0, 10),
  });
}
