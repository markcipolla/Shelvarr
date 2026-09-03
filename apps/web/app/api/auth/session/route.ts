import { NextResponse, type NextRequest } from 'next/server';
import { auth } from '@shelvarr/services';
import '@/lib/config';

export const dynamic = 'force-dynamic';

/** Who the caller is. Used by the native app to confirm a stored token still works. */
export async function GET(request: NextRequest) {
  const result = auth.authenticateRequest(request.headers);

  if (!result) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (result.kind !== 'session') {
    // Authentication is off, or a shared API key was used. Either way there
    // is access but no identity to report.
    return NextResponse.json({ user: null, kind: result.kind });
  }

  return NextResponse.json({ user: result.user, kind: 'session' });
}
