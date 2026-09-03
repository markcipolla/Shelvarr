import { NextResponse, type NextRequest } from 'next/server';
import { auth } from '@shelvarr/services';
import '@/lib/config';

export const dynamic = 'force-dynamic';

/**
 * Ask for a one-time sign-in code, for clients that are not the web UI.
 *
 * Answers the same way whether or not the address has an account — this is
 * unauthenticated, so it must not become a way to enumerate users. In
 * particular the code itself is never in the response, even when mail is
 * unconfigured and the server had to fall back to logging it.
 */
export async function POST(request: NextRequest) {
  if (!auth.isAuthEnabled()) {
    return NextResponse.json(
      { error: 'Authentication is disabled on this server' },
      { status: 400 }
    );
  }

  let body: { email?: unknown; client?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Expected a JSON body' }, { status: 400 });
  }

  const email = typeof body.email === 'string' ? body.email : '';
  if (!auth.isValidEmail(email)) {
    return NextResponse.json({ error: 'Enter a valid email address' }, { status: 400 });
  }

  const client = body.client === 'native' ? 'native' : 'web';

  try {
    const result = await auth.requestLogin({ email, client });
    return NextResponse.json({
      emailSent: result.emailSent,
      expiresAt: result.expiresAt,
      codeLength: result.codeLength,
      message: result.emailSent
        ? 'If that address has an account, a sign-in code is on its way.'
        : 'Email is not configured on this server. The code is in the server log.',
    });
  } catch (error) {
    if (error instanceof auth.AuthError && error.code === 'rate-limited') {
      return NextResponse.json({ error: error.message }, { status: 429 });
    }
    // Everything else is reported as success, for the same reason.
    return NextResponse.json({
      emailSent: false,
      expiresAt: new Date().toISOString(),
      codeLength: auth.LOGIN_CODE_LENGTH,
    });
  }
}
