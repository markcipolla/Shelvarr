import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/**
 * Deliberately public — the Docker healthcheck and the native app's "can I
 * reach this server?" test both call it before anyone has signed in. It says
 * nothing about the library or its users.
 */
export async function GET() {
  return NextResponse.json({ status: 'ok', timestamp: new Date().toISOString() });
}
