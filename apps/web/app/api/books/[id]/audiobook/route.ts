import { NextResponse } from 'next/server';
import '@/lib/config';
import { queryOne } from '@/lib/db';
import { validateApiAuth, audiobook, queue } from '@shelvarr/services';

export const dynamic = 'force-dynamic';

interface BookRow {
  file_path: string;
  title: string | null;
}

function getBook(id: string): BookRow | null {
  return queryOne<BookRow>('SELECT file_path, title FROM books WHERE id = ?', [id]);
}

/** The pending or running audiobook task for a book, if one is in flight. */
function activeTask(bookId: number) {
  const { tasks } = queue.getTasks({
    type: 'audiobook',
    statuses: ['pending', 'running'],
    limit: 100,
  });

  return tasks.find((task) => (task.data as { bookId?: number } | undefined)?.bookId === bookId);
}

/**
 * Audiobook status: whether one exists, its tracks, and any in-flight generation.
 */
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

  const book = getBook(id);
  if (!book) {
    return NextResponse.json({ error: 'Book not found' }, { status: 404 });
  }

  const manifest = audiobook.readManifest(book.file_path);
  const task = activeTask(Number(id));

  return NextResponse.json({
    configured: audiobook.isConfigured(),
    supported: book.file_path.toLowerCase().endsWith('.epub'),
    generated: !!manifest,
    generatedAt: manifest?.generatedAt ?? null,
    voice: manifest?.voice ?? null,
    tracks: manifest?.tracks ?? [],
    task: task
      ? { id: task.id, status: task.status, progress: task.progress, total: task.total }
      : null,
  });
}

/**
 * Queue audiobook generation for a book.
 */
export async function POST(
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

  const book = getBook(id);
  if (!book) {
    return NextResponse.json({ error: 'Book not found' }, { status: 404 });
  }

  if (!audiobook.isConfigured()) {
    return NextResponse.json(
      { error: 'Kokoro TTS is not configured. Add your server under Settings → Narration.' },
      { status: 503 }
    );
  }

  if (!book.file_path.toLowerCase().endsWith('.epub')) {
    return NextResponse.json(
      { error: 'Audiobook generation currently supports EPUB only' },
      { status: 400 }
    );
  }

  const existing = activeTask(Number(id));
  if (existing) {
    return NextResponse.json(
      { error: 'Audiobook generation is already in progress', taskId: existing.id },
      { status: 409 }
    );
  }

  const body = (await request.json().catch(() => ({}))) as { force?: boolean };
  const task = queue.enqueueTask('audiobook', {
    bookId: Number(id),
    force: body?.force === true,
  });

  return NextResponse.json({ taskId: task.id, status: task.status }, { status: 202 });
}
