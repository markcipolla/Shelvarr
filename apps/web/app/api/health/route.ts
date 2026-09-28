import { NextResponse } from 'next/server';
import { isReady } from '@/lib/health';

export const dynamic = 'force-dynamic';

/**
 * The same readiness answer `/up` gives, in JSON, for callers that want a body
 * rather than a status code: the native app tests a server address by looking
 * for `status: "ok"` here, and existing installs' Docker healthchecks point at
 * this path. `/up` is the one to aim a new probe at.
 *
 * Deliberately public — both callers ask before anyone has signed in, and the
 * answer says nothing about the library or its users. A container whose data
 * volume is missing or whose database will not open answers 503, so a deploy
 * never routes traffic to it.
 */
export async function GET() {
  if (!isReady()) {
    return NextResponse.json(
      { status: 'error', database: 'unavailable', timestamp: new Date().toISOString() },
      { status: 503 }
    );
  }

  return NextResponse.json({
    status: 'ok',
    database: 'ok',
    timestamp: new Date().toISOString(),
  });
}
