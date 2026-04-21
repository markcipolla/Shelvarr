import { NextResponse } from 'next/server';
import { createReadStream, statSync } from 'fs';
import { extname } from 'path';
import { Readable } from 'stream';
import '@/lib/config';
import { queryOne } from '@/lib/db';
import { validateApiAuth } from '@shelvarr/services';

export const dynamic = 'force-dynamic';

const MEDIA_TYPES: Record<string, string> = {
  epub: 'application/epub+zip',
  pdf: 'application/pdf',
  cbz: 'application/x-cbz',
  cbr: 'application/x-cbr',
  mobi: 'application/x-mobipocket-ebook',
};

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!validateApiAuth(request.headers)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  if (!/^\d+$/.test(id)) {
    return NextResponse.json({ error: 'Invalid book ID' }, { status: 400 });
  }

  const row = queryOne<{ file_path: string; extension: string | null; title: string | null }>(
    'SELECT file_path, extension, title FROM books WHERE id = ?',
    [id]
  );

  if (!row) {
    return NextResponse.json({ error: 'Book not found' }, { status: 404 });
  }

  try {
    const stats = statSync(row.file_path);
    const ext = row.extension || extname(row.file_path).replace('.', '');
    const contentType = MEDIA_TYPES[ext] || 'application/octet-stream';
    const filename = row.title ? `${row.title}.${ext}` : row.file_path.split('/').pop() || 'book';

    const stream = createReadStream(row.file_path);
    const webStream = Readable.toWeb(stream) as ReadableStream;

    return new Response(webStream, {
      headers: {
        'Content-Type': contentType,
        'Content-Length': String(stats.size),
        'Content-Disposition': `attachment; filename="${encodeURIComponent(filename)}"`,
      },
    });
  } catch {
    return NextResponse.json({ error: 'File not found on disk' }, { status: 404 });
  }
}
