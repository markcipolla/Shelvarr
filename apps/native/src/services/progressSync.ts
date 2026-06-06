import { updateReadProgress, updateEpubProgression } from './api/books';
import { updateComicProgress } from './api/comics';
import { PROGRESS_SYNC_DEBOUNCE_MS } from '../utils/constants';

interface QueuedProgress {
  bookId: string;
  page: number;
  completed: boolean;
  timestamp: number;
  epub?: boolean;
  epubProgress?: number;
  epubHref?: string;
  comic?: boolean;
  issueId?: number;
}

const pendingSync: Map<string, QueuedProgress> = new Map();
const timers: Map<string, ReturnType<typeof setTimeout>> = new Map();
const offlineQueue: QueuedProgress[] = [];

export function syncProgress(bookId: string, page: number, completed: boolean = false): void {
  const entry: QueuedProgress = { bookId, page, completed, timestamp: Date.now() };
  pendingSync.set(bookId, entry);

  const existing = timers.get(bookId);
  if (existing) clearTimeout(existing);

  const timer = setTimeout(() => {
    flushProgress(bookId);
  }, PROGRESS_SYNC_DEBOUNCE_MS);
  timers.set(bookId, timer);
}

export function syncEpubProgress(bookId: string, progress: number, completed: boolean = false, href: string = ''): void {
  const entry: QueuedProgress = { bookId, page: 0, completed, timestamp: Date.now(), epub: true, epubProgress: progress, epubHref: href };
  pendingSync.set(bookId, entry);

  const existing = timers.get(bookId);
  if (existing) clearTimeout(existing);

  const timer = setTimeout(() => {
    flushProgress(bookId);
  }, PROGRESS_SYNC_DEBOUNCE_MS);
  timers.set(bookId, timer);
}

export function syncComicProgress(issueId: number, page: number, completed: boolean = false): void {
  const bookId = `comic-${issueId}`;
  const entry: QueuedProgress = { bookId, page, completed, timestamp: Date.now(), comic: true, issueId };
  pendingSync.set(bookId, entry);

  const existing = timers.get(bookId);
  if (existing) clearTimeout(existing);

  const timer = setTimeout(() => {
    flushProgress(bookId);
  }, PROGRESS_SYNC_DEBOUNCE_MS);
  timers.set(bookId, timer);
}

export async function flushProgress(bookId: string): Promise<void> {
  const entry = pendingSync.get(bookId);
  if (!entry) return;

  pendingSync.delete(bookId);
  timers.delete(bookId);

  try {
    if (entry.epub) {
      /* istanbul ignore next -- epubProgress/epubHref always set by syncEpubProgress */
      await updateEpubProgression(entry.bookId, entry.epubProgress ?? 0, entry.completed, entry.epubHref ?? '');
    } else if (entry.comic && entry.issueId !== undefined) {
      await updateComicProgress(entry.issueId, entry.page, entry.completed);
    } else {
      await updateReadProgress(entry.bookId, entry.page, entry.completed);
    }
  } catch (err) {
    offlineQueue.push(entry);
  }
}

export async function flushAllProgress(): Promise<void> {
  const bookIds = Array.from(pendingSync.keys());
  await Promise.allSettled(bookIds.map((id) => flushProgress(id)));
}

export async function retryOfflineQueue(): Promise<void> {
  const items = [...offlineQueue];
  offlineQueue.length = 0;

  for (const item of items) {
    try {
      if (item.epub) {
        /* istanbul ignore next -- epubProgress/epubHref always set by syncEpubProgress */
        await updateEpubProgression(item.bookId, item.epubProgress ?? 0, item.completed, item.epubHref ?? '');
      } else if (item.comic && item.issueId !== undefined) {
        await updateComicProgress(item.issueId, item.page, item.completed);
      } else {
        await updateReadProgress(item.bookId, item.page, item.completed);
      }
    } catch {
      offlineQueue.push(item);
    }
  }
}
