import { NextResponse, type NextRequest } from 'next/server';
import { auth } from '@shelvarr/services';
import '@/lib/config';

export const dynamic = 'force-dynamic';

/**
 * Ask for a magic link over HTTP, for clients that are not the web UI.
 *
 * Answers the same way whether or not the address has an account — this is
 * unauthenticated, so it must not become a way to enumerate users.
 */
export async function POST(request: NextRequest) {
  if (!auth.isAuthEnabled()) {
    return NextResponse.json(
      { error: 'Authentication is disabled on this server' },
      { status: 400 }
    );
  }

  let body: { email?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Expected a JSON body' }, { status: 400 });
  }

  const email = typeof body.email === 'string' ? body.email : '';
  if (!auth.isValidEmail(email)) {
    return NextResponse.json({ error: 'Enter a valid email address' }, { status: 400 });
  }

  const host = request.headers.get('x-forwarded-host') || request.headers.get('host');
  const proto =
    request.headers.get('x-forwarded-proto')?.split(',')[0]?.trim() ||
    request.nextUrl.protocol.replace(':', '');

  try {
    const result = await auth.requestLogin({
      email,
      client: 'web',
      origin: host ? `${proto}://${host}` : request.nextUrl.origin,
    });
    return NextResponse.json({
      ok: true,
      emailSent: result.emailSent,
      message: result.emailSent
        ? 'If that address has an account, a sign-in link is on its way.'
        : 'Email is not configured on this server. The link is in the server log.',
    });
  } catch (error) {
    if (error instanceof auth.AuthError && error.code === 'rate-limited') {
      return NextResponse.json({ error: error.message }, { status: 429 });
    }
    // Everything else is reported as success, for the same reason.
    return NextResponse.json({ ok: true, emailSent: false });
  }
}
