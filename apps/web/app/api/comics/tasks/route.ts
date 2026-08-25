import { NextRequest, NextResponse } from 'next/server';
import '@/lib/config';
import { validateApiAuth, queue } from '@shelvarr/services';
import type { TaskType } from '@shelvarr/services/queue/index';

export const dynamic = 'force-dynamic';

/** Library-wide jobs the user can trigger by hand. */
const LIBRARY_TASKS: Record<string, TaskType> = {
  updateAll: 'comic_update_all',
  searchAll: 'comic_search_all',
};

/**
 * Kick off a library-wide job: refresh every stale volume's metadata, or
 * search for every missing issue.
 */
export async function POST(request: NextRequest) {
  if (!validateApiAuth(request.headers)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    action?: string;
    limit?: number;
    maxAgeHours?: number;
  };

  const taskType = body.action ? LIBRARY_TASKS[body.action] : undefined;
  if (!taskType) {
    return NextResponse.json(
      { error: `action must be one of: ${Object.keys(LIBRARY_TASKS).join(', ')}` },
      { status: 400 }
    );
  }

  return NextResponse.json(
    {
      task: queue.enqueueTask(taskType, {
        ...(body.limit !== undefined ? { limit: body.limit } : {}),
        ...(body.maxAgeHours !== undefined ? { maxAgeHours: body.maxAgeHours } : {}),
      }),
    },
    { status: 202 }
  );
}
