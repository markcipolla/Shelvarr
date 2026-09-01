import { NextResponse, type NextRequest } from 'next/server';
import { auth } from '@shelvarr/services';
import '@/lib/config';
import { SESSION_COOKIE } from '@/lib/auth';

export const dynamic = 'force-dynamic';

/**
 * The other end of a magic link.
 *
 * This is a route handler rather than a page because it has to set a cookie,
 * and Next.js only allows that from route handlers and server actions.
 *
 * A web login lands signed in. A native login lands on a confirmation page —
 * the phone that started it collects its session by polling, so the email can
 * be opened anywhere.
 */
/** Whether the visitor reached us over HTTPS, reverse proxies included. */
function isHttps(request: NextRequest): boolean {
  const forwarded = request.headers.get('x-forwarded-proto');
  if (forwarded) return forwarded.split(',')[0]?.trim() === 'https';
  return request.nextUrl.protocol === 'https:';
}

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get('token');
  if (!token) {
    return NextResponse.redirect(new URL('/login?error=invalid-token', request.url));
  }

  if (!auth.isAuthEnabled()) {
    return NextResponse.redirect(new URL('/', request.url));
  }

  let result;
  try {
    result = auth.verifyLoginToken(token, request.headers.get('user-agent'));
  } catch {
    // Every failure looks the same on purpose: whether a link is unknown,
    // spent or expired is not something an anonymous caller should learn.
    return NextResponse.redirect(new URL('/login?error=invalid-token', request.url));
  }

  if (result.kind === 'native') {
    const target = new URL('/verify-device', request.url);
    if (result.userCode) target.searchParams.set('code', result.userCode);
    return NextResponse.redirect(target);
  }

  const destination = auth.isSafeRedirect(result.redirectTo) ? result.redirectTo : '/';
  const response = NextResponse.redirect(new URL(destination, request.url));

  response.cookies.set(SESSION_COOKIE, result.issued!.token, {
    httpOnly: true,
    sameSite: 'lax',
    // Follows the request rather than NODE_ENV: many installs are plain HTTP
    // on a home network, where a Secure cookie would never come back.
    secure: isHttps(request),
    path: '/',
    maxAge: auth.getAuthConfig().sessionTtlSeconds,
  });

  return response;
}
