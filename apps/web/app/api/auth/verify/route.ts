import { NextResponse, type NextRequest } from 'next/server';
import { auth } from '@shelvarr/services';
import '@/lib/config';
import { SESSION_COOKIE } from '@/lib/auth';

export const dynamic = 'force-dynamic';

/** Whether the caller reached us over HTTPS, reverse proxies included. */
function isHttps(request: NextRequest): boolean {
  const forwarded = request.headers.get('x-forwarded-proto');
  if (forwarded) return forwarded.split(',')[0]?.trim() === 'https';
  return request.nextUrl.protocol === 'https:';
}

/**
 * Trade an emailed code for a session.
 *
 * A native client reads the token out of the body and stores it itself; a
 * browser gets the same session as a cookie, which is why this sets one
 * either way and only web clients ever look at it.
 */
export async function POST(request: NextRequest) {
  if (!auth.isAuthEnabled()) {
    return NextResponse.json(
      { error: 'Authentication is disabled on this server' },
      { status: 400 }
    );
  }

  let body: { email?: unknown; code?: unknown; client?: unknown; label?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Expected a JSON body' }, { status: 400 });
  }

  const email = typeof body.email === 'string' ? body.email : '';
  const code = typeof body.code === 'string' ? body.code : '';
  if (!email || !code) {
    return NextResponse.json({ error: 'Enter your email address and the code' }, { status: 400 });
  }

  const client = body.client === 'native' ? 'native' : 'web';
  const label =
    typeof body.label === 'string' && body.label.trim()
      ? body.label.trim().slice(0, 120)
      : request.headers.get('user-agent');

  let result;
  try {
    result = auth.verifyLoginCode({ email, code, client, label });
  } catch (error) {
    const message =
      error instanceof auth.AuthError ? error.message : 'That code could not be used';
    // 401 rather than 400: the code is a credential, and it was rejected.
    return NextResponse.json({ error: message }, { status: 401 });
  }

  const response = NextResponse.json({
    token: result.issued.token,
    expiresAt: result.issued.session.expiresAt,
    user: result.user,
    redirectTo: auth.isSafeRedirect(result.redirectTo) ? result.redirectTo : null,
  });

  if (client === 'web') {
    response.cookies.set(SESSION_COOKIE, result.issued.token, {
      httpOnly: true,
      sameSite: 'lax',
      // Follows the request rather than NODE_ENV: many installs are plain
      // HTTP on a home network, where a Secure cookie would never come back.
      secure: isHttps(request),
      path: '/',
      maxAge: auth.getAuthConfig().sessionTtlSeconds,
    });
  }

  return response;
}
