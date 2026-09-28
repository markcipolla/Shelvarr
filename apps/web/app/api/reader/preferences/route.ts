/**
 * Reader preferences: type size, typeface, line height, margins, theme.
 *
 * Per user and pointedly *not* per device or per book — that is the whole
 * reason these live on the server rather than in localStorage. Pick your type
 * size once on the laptop and the tablet already agrees.
 *
 * Contrast with `/api/books/[id]/progression`, which is per user *and* per
 * device: where you are in a book belongs to the copy in your hands, how you
 * like the type belongs to your eyes.
 */

import { NextResponse } from 'next/server';
import '@/lib/config';
import { getReaderPreferences, setReaderPreferences } from '@/lib/db';
import { validateApiAuth, getReadingUserId } from '@shelvarr/services';
import {
  DEFAULT_READER_PREFERENCES,
  normaliseReaderPreferences,
} from '@/lib/reader/preferences';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  if (!validateApiAuth(request.headers)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const row = getReaderPreferences(getReadingUserId(request.headers));
  if (!row) {
    return NextResponse.json(DEFAULT_READER_PREFERENCES);
  }

  // A stored blob is parsed and normalised here rather than trusted: it may
  // have been written by an older build, and a reader should never be handed
  // a line height of "banana".
  let stored: unknown = null;
  try {
    stored = JSON.parse(row.preferences);
  } catch {
    stored = null;
  }
  return NextResponse.json(normaliseReaderPreferences(stored));
}

export async function PUT(request: Request) {
  if (!validateApiAuth(request.headers)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  // Normalised before storage as well as after reading it back, so a client
  // sending nonsense stores defaults rather than poisoning the row.
  const preferences = normaliseReaderPreferences(body);
  setReaderPreferences(getReadingUserId(request.headers), JSON.stringify(preferences));
  return NextResponse.json(preferences);
}
