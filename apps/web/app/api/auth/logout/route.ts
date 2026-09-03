import { NextResponse, type NextRequest } from 'next/server';
import { auth } from '@shelvarr/services';
import '@/lib/config';

export const dynamic = 'force-dynamic';

/** End the session the request is carrying. Safe to call with a dead token. */
export async function POST(request: NextRequest) {
  const token = auth.extractSessionToken(request.headers);
  if (token) auth.revokeSessionToken(token);

  const response = NextResponse.json({ ok: true });
  response.cookies.delete(auth.SESSION_COOKIE_NAME);
  return response;
}
