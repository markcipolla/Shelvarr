import { NextRequest, NextResponse } from 'next/server';
import '@/lib/config';
import { admin } from '@shelvarr/services';

export const dynamic = 'force-dynamic';

/**
 * Plain-JSON twin of the MCP `get_status` tool, for curl, a dashboard, or
 * anything that would rather not speak JSON-RPC. Same gate, same data.
 */
export async function GET(request: NextRequest) {
  const auth = admin.authoriseAdminRequest(request.headers);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  return NextResponse.json(admin.getSystemStatus());
}
