import { NextResponse } from 'next/server';
import { validateApiAuth } from '@shelvarr/services';

export const dynamic = 'force-dynamic';

export function GET(request: Request) {
  if (!validateApiAuth(request.headers)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Not implemented for ebook-only libraries
  return NextResponse.json({ error: 'Not found' }, { status: 404 });
}
