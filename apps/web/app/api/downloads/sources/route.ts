import { NextRequest, NextResponse } from 'next/server';
import '@/lib/config';
import { validateApiAuth } from '@shelvarr/services';
import { getSourceStatuses } from '@/lib/services/downloads';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  if (!validateApiAuth(request.headers)) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  const forceRefresh = request.nextUrl.searchParams.get('refresh') === 'true';

  try {
    const statuses = await getSourceStatuses(forceRefresh);
    return NextResponse.json({ success: true, statuses });
  } catch (err) {
    return NextResponse.json({
      success: false,
      statuses: [],
      error: err instanceof Error ? err.message : 'Failed to load source statuses',
    });
  }
}
