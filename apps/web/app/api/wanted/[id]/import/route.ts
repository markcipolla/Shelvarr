import { NextRequest, NextResponse } from 'next/server';
import '@/lib/config';
import { randomBytes } from 'crypto';
import { mkdirSync, writeFileSync } from 'fs';
import { basename, extname, join } from 'path';
import { getWantedBookById } from '@/lib/db';
import { validateApiAuth, getServiceConfig } from '@shelvarr/services';
import { getLibraryById } from '@/lib/services/library';
import { enqueueTask } from '@/lib/services/queue';

export const dynamic = 'force-dynamic';

/**
 * Strip everything but the base name and swap unsafe characters, so a
 * scratch filename built from an upload's original name can't escape the
 * scratch directory or trip up the filesystem.
 */
function sanitizeForScratch(name: string): string {
  return basename(name).replace(/[^a-zA-Z0-9._-]/g, '_').slice(-200) || 'upload';
}

/**
 * Manual book import (E4-3): a person already downloaded a file themselves —
 * from Anna's Archive or Z-Library, which Shelvarr can't fetch directly yet,
 * or just by hand — and hands it to Shelvarr instead of dropping it in a
 * library folder and waiting for the nightly scan.
 *
 * The upload is saved to a scratch location synchronously (the browser is
 * holding the file for the duration of this request, so it has to land
 * somewhere before the response goes out), then handed to a `book_import`
 * task — the same "identify, then file" treatment `download` gives a file it
 * fetched itself, just without a network fetch first.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!validateApiAuth(request.headers)) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  const numericId = Number(id);
  if (!Number.isInteger(numericId)) {
    return NextResponse.json({ success: false, error: 'Invalid id' }, { status: 400 });
  }

  const wantedBook = getWantedBookById(numericId);
  if (!wantedBook) {
    return NextResponse.json({ success: false, error: 'Wanted book not found' }, { status: 404 });
  }

  // Cast through `globalThis.FormData`: Next's own `.d.ts` for `formData()`
  // resolves to a narrower structural type (missing `get`/`has`/etc — a quirk
  // of its bundled edge-runtime type shims), even though the value at runtime
  // is a normal `FormData`.
  let formData: globalThis.FormData;
  try {
    formData = (await request.formData()) as unknown as globalThis.FormData;
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid form data' }, { status: 400 });
  }

  const file = formData.get('file');
  if (!(file instanceof File)) {
    return NextResponse.json({ success: false, error: 'file is required' }, { status: 400 });
  }

  const libraryIdRaw = formData.get('libraryId');
  const libraryId = Number(libraryIdRaw);
  if (!libraryIdRaw || !Number.isInteger(libraryId)) {
    return NextResponse.json({ success: false, error: 'libraryId is required' }, { status: 400 });
  }

  const library = await getLibraryById(libraryId);
  if (!library) {
    return NextResponse.json({ success: false, error: 'Library not found' }, { status: 404 });
  }

  const ext = extname(file.name).toLowerCase();
  const supportedExtensions = getServiceConfig().supportedExtensions;
  if (!ext || !supportedExtensions.includes(ext)) {
    return NextResponse.json(
      {
        success: false,
        error: `Unsupported file type ${ext || '(none)'}. Expected one of: ${supportedExtensions.join(', ')}`,
      },
      { status: 400 }
    );
  }

  // The browser is holding this file for as long as the request is open, so
  // it has to be saved before the response goes out — enqueueing a task with
  // just a File reference wouldn't survive past this handler returning.
  const scratchDir = join(getServiceConfig().dataDir, 'import-scratch');
  mkdirSync(scratchDir, { recursive: true });
  const scratchPath = join(
    scratchDir,
    `${Date.now()}-${randomBytes(4).toString('hex')}-${sanitizeForScratch(file.name)}`
  );
  writeFileSync(scratchPath, Buffer.from(await file.arrayBuffer()));

  const task = enqueueTask('book_import', {
    libraryId,
    filePath: scratchPath,
    originalFilename: file.name,
    extension: ext.replace('.', ''),
    title: wantedBook.title,
    author: wantedBook.author,
    wantedBookId: wantedBook.id,
  });

  return NextResponse.json({ success: true, taskId: task.id });
}
