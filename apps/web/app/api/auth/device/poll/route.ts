import { NextResponse, type NextRequest } from 'next/server';
import { auth } from '@shelvarr/services';
import '@/lib/config';

export const dynamic = 'force-dynamic';

/**
 * The native app asking whether its sign-in has been approved.
 *
 * Returns 200 for every outcome the app should keep handling — pending,
 * expired, denied, approved — so a slow approval does not read as an error.
 */
export async function POST(request: NextRequest) {
  if (!auth.isAuthEnabled()) {
    return NextResponse.json(
      { error: 'Authentication is disabled on this server' },
      { status: 400 }
    );
  }

  let body: { deviceCode?: unknown; label?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Expected a JSON body' }, { status: 400 });
  }

  const deviceCode = typeof body.deviceCode === 'string' ? body.deviceCode : '';
  if (!deviceCode) {
    return NextResponse.json({ error: 'Missing device code' }, { status: 400 });
  }

  const label =
    typeof body.label === 'string' && body.label.trim()
      ? body.label.trim().slice(0, 120)
      : request.headers.get('user-agent');

  return NextResponse.json(auth.pollDeviceLogin(deviceCode, label));
}

/** Abandon a pending sign-in, so the emailed link stops working. */
export async function DELETE(request: NextRequest) {
  const deviceCode = request.nextUrl.searchParams.get('deviceCode');
  if (!deviceCode) {
    return NextResponse.json({ error: 'Missing device code' }, { status: 400 });
  }
  return NextResponse.json({ cancelled: auth.cancelDeviceLogin(deviceCode) });
}
