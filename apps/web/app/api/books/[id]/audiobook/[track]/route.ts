import { NextResponse } from 'next/server';
import { createReadStream, statSync } from 'fs';
import { Readable } from 'stream';
import '@/lib/config';
import { queryOne } from '@/lib/db';
import { validateApiAuth, audiobook } from '@shelvarr/services';

export const dynamic = 'force-dynamic';

/**
 * Stream a generated audiobook track. Supports Range requests so audio players
 * can seek without downloading the whole chapter.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string; track: string }> }
) {
  if (!validateApiAuth(request.headers)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id, track } = await params;
  if (!/^\d+$/.test(id)) {
    return NextResponse.json({ error: 'Invalid book ID' }, { status: 400 });
  }

  const book = queryOne<{ file_path: string }>(
    'SELECT file_path FROM books WHERE id = ?',
    [id]
  );
  if (!book) {
    return NextResponse.json({ error: 'Book not found' }, { status: 404 });
  }

  const filePath = audiobook.resolveTrack(book.file_path, decodeURIComponent(track));
  if (!filePath) {
    return NextResponse.json({ error: 'Track not found' }, { status: 404 });
  }

  const size = statSync(filePath).size;
  const range = request.headers.get('range');
  const match = range ? /^bytes=(\d*)-(\d*)$/.exec(range.trim()) : null;

  if (match) {
    const startRaw = match[1];
    const endRaw = match[2];

    // A suffix range ("bytes=-500") asks for the final N bytes.
    const start = startRaw ? Number(startRaw) : Math.max(0, size - Number(endRaw || 0));
    const end = startRaw ? (endRaw ? Math.min(Number(endRaw), size - 1) : size - 1) : size - 1;

    if (Number.isNaN(start) || Number.isNaN(end) || start > end || start >= size) {
      return new Response(null, {
        status: 416,
        headers: { 'Content-Range': `bytes */${size}` },
      });
    }

    const stream = Readable.toWeb(createReadStream(filePath, { start, end })) as ReadableStream;
    return new Response(stream, {
      status: 206,
      headers: {
        'Content-Type': 'audio/mpeg',
        'Content-Length': String(end - start + 1),
        'Content-Range': `bytes ${start}-${end}/${size}`,
        'Accept-Ranges': 'bytes',
      },
    });
  }

  const stream = Readable.toWeb(createReadStream(filePath)) as ReadableStream;
  return new Response(stream, {
    headers: {
      'Content-Type': 'audio/mpeg',
      'Content-Length': String(size),
      'Accept-Ranges': 'bytes',
    },
  });
}
