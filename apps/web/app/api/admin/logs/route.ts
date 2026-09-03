import { NextRequest, NextResponse } from 'next/server';
import '@/lib/config';
import { admin } from '@shelvarr/services';
import type { LogLevel } from '@shelvarr/services/utils/logger';

export const dynamic = 'force-dynamic';

const LOG_LEVELS: LogLevel[] = ['debug', 'info', 'warn', 'error'];

/** A query-string integer, or undefined when absent or not a number. */
function intParam(params: URLSearchParams, name: string): number | undefined {
  const raw = params.get(name);
  if (raw === null) return undefined;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : undefined;
}

/**
 * Plain-JSON twin of the MCP `search_logs` tool.
 *
 * `?level=warn&context=scheduler&search=timeout&since=<iso>&limit=200`
 */
export async function GET(request: NextRequest) {
  const auth = admin.authoriseAdminRequest(request.headers);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const params = request.nextUrl.searchParams;
  const level = params.get('level');
  if (level && !LOG_LEVELS.includes(level as LogLevel)) {
    return NextResponse.json(
      { error: `level must be one of: ${LOG_LEVELS.join(', ')}` },
      { status: 400 }
    );
  }

  const afterSequence = intParam(params, 'afterSequence');
  const limit = intParam(params, 'limit');

  return NextResponse.json(
    admin.searchLogs({
      ...(level ? { minLevel: level as LogLevel } : {}),
      ...(params.get('context') ? { context: params.get('context')! } : {}),
      ...(params.get('search') ? { search: params.get('search')! } : {}),
      ...(params.get('since') ? { since: params.get('since')! } : {}),
      ...(afterSequence !== undefined ? { afterSequence } : {}),
      ...(limit !== undefined ? { limit } : {}),
    })
  );
}
