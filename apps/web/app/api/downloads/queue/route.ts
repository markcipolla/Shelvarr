import { NextRequest, NextResponse } from 'next/server';
import '@/lib/config';
import { validateApiAuth } from '@shelvarr/services';
import { enqueueTask } from '@/lib/services/queue';

export const dynamic = 'force-dynamic';

interface QueueBody {
  source?: 'libgen' | 'annas' | 'zlibrary';
  md5?: string;
  title?: string;
  author?: string;
  extension?: string;
  libraryId?: number;
  wantedBookId?: number;
}

export async function POST(request: NextRequest) {
  if (!validateApiAuth(request.headers)) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  let body: QueueBody;
  try {
    body = (await request.json()) as QueueBody;
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid JSON body' }, { status: 400 });
  }

  if (!body.source || !body.md5 || !body.libraryId) {
    return NextResponse.json(
      { success: false, error: 'source, md5 and libraryId are required' },
      { status: 400 }
    );
  }

  try {
    const task = enqueueTask('download', {
      source: body.source,
      md5: body.md5,
      title: body.title || '',
      author: body.author || '',
      extension: body.extension || '',
      libraryId: body.libraryId,
      wantedBookId: body.wantedBookId,
    });

    return NextResponse.json({ success: true, taskId: task.id });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : 'Failed to queue download' },
      { status: 500 }
    );
  }
}
