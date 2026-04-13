import { NextResponse } from 'next/server';
import { validateApiAuth } from '@shelvarr/services';

export const dynamic = 'force-dynamic';

export function GET(request: Request) {
  if (!validateApiAuth(request.headers)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // For ebooks this returns an empty array; page-based readers would need CBZ extraction
  return NextResponse.json([]);
}
