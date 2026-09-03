import { NextResponse, type NextRequest } from 'next/server';

/**
 * Passes the requested path through to server components as a header.
 *
 * Next.js does not otherwise hand a layout the URL it is rendering, and the
 * sign-in redirect needs it to send someone back where they were going.
 *
 * The sign-in check itself deliberately does not happen here: this runs on the
 * edge runtime, where `process.env` is inlined at build time and SQLite is
 * unavailable, so it could neither read the runtime configuration nor look up
 * a session. The `(app)` layout does the real check.
 */
export default function proxy(request: NextRequest) {
  const headers = new Headers(request.headers);
  headers.set('x-shelvarr-path', request.nextUrl.pathname + request.nextUrl.search);
  return NextResponse.next({ request: { headers } });
}

export const config = {
  matcher: [
    // Everything except API routes, Next internals and static files.
    '/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
};
