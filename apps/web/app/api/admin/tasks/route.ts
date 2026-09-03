import { NextRequest, NextResponse } from 'next/server';
import '@/lib/config';
import { admin } from '@shelvarr/services';
import type { TaskStatus, TaskType } from '@shelvarr/services/queue/index';

export const dynamic = 'force-dynamic';

const TASK_STATUSES: TaskStatus[] = ['pending', 'running', 'completed', 'failed', 'cancelled'];

/**
 * Plain-JSON twin of the MCP `list_tasks` tool.
 *
 * `?status=failed&type=comic_scan&limit=50`
 */
export async function GET(request: NextRequest) {
  const auth = admin.authoriseAdminRequest(request.headers);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const params = request.nextUrl.searchParams;
  const status = params.get('status');
  if (status && !TASK_STATUSES.includes(status as TaskStatus)) {
    return NextResponse.json(
      { error: `status must be one of: ${TASK_STATUSES.join(', ')}` },
      { status: 400 }
    );
  }

  const limitRaw = params.get('limit');
  const limit = limitRaw === null ? undefined : Number.parseInt(limitRaw, 10);

  return NextResponse.json(
    admin.listTasks({
      ...(status ? { status: status as TaskStatus } : {}),
      ...(params.get('type') ? { type: params.get('type') as TaskType } : {}),
      ...(limit !== undefined && Number.isFinite(limit) ? { limit } : {}),
    })
  );
}
