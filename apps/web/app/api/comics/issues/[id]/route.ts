import { NextRequest, NextResponse } from 'next/server';
import '@/lib/config';
import { kapowarrClient, configureKapowarrFromDb } from '@/lib/services/kapowarr';
import { validateApiAuth } from '@shelvarr/services';

export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!validateApiAuth(request.headers)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  const issueId = parseInt(id, 10);
  if (!Number.isFinite(issueId)) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  }

  const configured = await configureKapowarrFromDb();
  if (!configured) {
    return NextResponse.json({ configured: false });
  }

  try {
    const issue = await kapowarrClient.getIssue(issueId);
    return NextResponse.json({ configured: true, issue });
  } catch (err) {
    return NextResponse.json({
      configured: true,
      error: err instanceof Error ? err.message : 'Failed to load issue',
    });
  }
}
