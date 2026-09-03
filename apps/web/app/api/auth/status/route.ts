import { NextResponse } from 'next/server';
import { auth } from '@shelvarr/services';
import '@/lib/config';

export const dynamic = 'force-dynamic';

/**
 * Public on purpose: a client has to know whether this server wants a login
 * before it can decide which screen to show. It reveals only whether accounts
 * are in use, not who holds them.
 */
export async function GET() {
  return NextResponse.json(auth.getAuthStatus());
}
