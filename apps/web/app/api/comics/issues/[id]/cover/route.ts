import { NextResponse } from 'next/server';
import '@/lib/config';
import { kapowarrClient, configureKapowarrFromDb } from '@/lib/services/kapowarr';

export const dynamic = 'force-dynamic';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const issueId = parseInt(id, 10);
  if (!Number.isFinite(issueId)) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  }

  const configured = await configureKapowarrFromDb();
  if (!configured) {
    return NextResponse.json({ error: 'Kapowarr not configured' }, { status: 404 });
  }

  const coverUrl = kapowarrClient.getIssueCoverUrl(issueId);
  if (!coverUrl) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const upstream = await fetch(coverUrl);
  if (!upstream.ok || !upstream.body) {
    return NextResponse.json(
      { error: `Upstream error: ${upstream.status}` },
      { status: upstream.status === 404 ? 404 : 502 }
    );
  }

  return new NextResponse(upstream.body, {
    status: 200,
    headers: {
      'Content-Type': upstream.headers.get('content-type') || 'image/jpeg',
      'Cache-Control': 'private, max-age=3600',
    },
  });
}
