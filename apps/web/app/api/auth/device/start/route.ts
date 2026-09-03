import { NextResponse, type NextRequest } from 'next/server';
import { auth } from '@shelvarr/services';
import '@/lib/config';

export const dynamic = 'force-dynamic';

function requestOrigin(request: NextRequest): string {
  const host = request.headers.get('x-forwarded-host') || request.headers.get('host');
  const proto =
    request.headers.get('x-forwarded-proto')?.split(',')[0]?.trim() ||
    request.nextUrl.protocol.replace(':', '');
  return host ? `${proto}://${host}` : request.nextUrl.origin;
}

/**
 * Start a sign-in from the native app.
 *
 * The app cannot receive the magic link itself, so this returns a device code
 * to poll with while the link is opened wherever the mail is convenient to
 * read — the same shape as an OAuth device flow.
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

  try {
    const result = await auth.requestLogin({
      email,
      client: 'native',
      origin: requestOrigin(request),
    });

    if (!result.device) {
      // The address has no account and self-signup is off. Answer as though
      // it worked — the app will simply poll until the request times out,
      // which is the same experience as an email nobody opens.
      return NextResponse.json(
        {
          deviceCode: null,
          userCode: null,
          emailSent: false,
          message: 'If that address has an account, a sign-in link is on its way.',
        },
        { status: 202 }
      );
    }

    return NextResponse.json({
      ...result.device,
      emailSent: result.emailSent,
      message: result.emailSent
        ? 'Check your email and open the link to approve this device.'
        : 'Email is not configured on this server. Ask the administrator for the sign-in link from the server log.',
    });
  } catch (error) {
    if (error instanceof auth.AuthError && error.code === 'rate-limited') {
      return NextResponse.json({ error: error.message }, { status: 429 });
    }
    return NextResponse.json({ error: 'Could not start sign-in' }, { status: 400 });
  }
}
