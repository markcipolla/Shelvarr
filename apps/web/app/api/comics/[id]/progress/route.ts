import { NextRequest, NextResponse } from 'next/server';
import '@/lib/config';
import { getComicReadProgressForVolume } from '@/lib/db';
import { validateApiAuth } from '@shelvarr/services';

export const dynamic = 'force-dynamic';

// Per-issue read progress for every tracked issue of a volume.
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!validateApiAuth(request.headers)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  const volumeId = parseInt(id, 10);
  if (!Number.isFinite(volumeId)) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  }

  return NextResponse.json({ progress: getComicReadProgressForVolume(volumeId) });
}
