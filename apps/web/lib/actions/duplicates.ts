'use server';

import { revalidatePath } from 'next/cache';
import { getAllDuplicates } from '@/lib/services/organizer';
import { deleteBook } from '@/lib/services/scanner';
import type { Book } from '@shelvarr/types';

/** One book the library holds more than once. */
export interface DuplicateBookCopy {
  id: number;
  title: string | null;
  authors: string[];
  filePath: string;
  fileSize: number | null;
  extension: string | null;
  /** Whether metadata was matched to a source — the better copy to keep. */
  matched: boolean;
}

export interface BookDuplicateGroup {
  /** `identical` when the files are byte-for-byte the same, else a guess. */
  kind: 'identical' | 'similar';
  /** Stable key for React and for the resolve call; the hash, or the ids. */
  key: string;
  /** 0–1. Always 1 for an identical group. */
  similarity: number;
  copies: DuplicateBookCopy[];
}

export interface DuplicatesView {
  books: BookDuplicateGroup[];
  comics: ComicDuplicateCandidateView[];
}

export interface ComicDuplicateCandidateView {
  title: string;
  volumes: Array<{
    id: number;
    comicvineId: number;
    title: string;
    folder: string | null;
    issueCount: number;
    holdsFiles: boolean;
  }>;
}

/** `authors` is a JSON array on the row, but older rows hold a bare string. */
function parseAuthors(authors: string | null): string[] {
  if (!authors) return [];
  try {
    const parsed = JSON.parse(authors);
    return Array.isArray(parsed) ? parsed.filter((a): a is string => typeof a === 'string') : [];
  } catch {
    return [authors];
  }
}

function toCopy(book: Book): DuplicateBookCopy {
  return {
    id: book.id,
    title: book.title,
    authors: parseAuthors(book.authors),
    filePath: book.filePath,
    fileSize: book.fileSize,
    extension: book.extension,
    matched: !!book.metadataSource,
  };
}

/**
 * Put the copy worth keeping first.
 *
 * A matched row carries metadata someone (or Hardcover) already settled, and
 * losing it means matching the book again. After that the bigger file wins —
 * between two scans of the same book the larger one is the unabridged or
 * higher-quality export often enough to be the better default.
 */
function bestFirst(copies: DuplicateBookCopy[]): DuplicateBookCopy[] {
  return [...copies].sort((a, b) => {
    if (a.matched !== b.matched) return a.matched ? -1 : 1;
    const bySize = (b.fileSize ?? 0) - (a.fileSize ?? 0);
    if (bySize !== 0) return bySize;
    return a.id - b.id;
  });
}

/**
 * Every duplicate the library can see, books and comics.
 *
 * Books come in two flavours. *Identical* means the same bytes under two
 * paths — nothing to weigh up, one of them is simply redundant. *Similar*
 * means the title, author and ISBN line up closely enough to be worth a
 * look: an epub beside a pdf, or a re-download that landed as "Title (1)".
 * The second kind is a suggestion, which is why nothing here acts on its own.
 *
 * Comics are already deduplicated where it can be proved (see
 * `mergeDuplicateComicVolumes`); what is listed here is the residue that
 * needs a person.
 */
export async function getDuplicatesAction(): Promise<DuplicatesView> {
  const { comicLibrary } = await import('@shelvarr/services');

  const { hashDuplicates, similarityDuplicates } = await getAllDuplicates();

  const identical: BookDuplicateGroup[] = hashDuplicates.map((group) => ({
    kind: 'identical' as const,
    key: `hash:${group.hash}`,
    similarity: 1,
    copies: bestFirst(group.books.map(toCopy)),
  }));

  // A group already reported as identical would otherwise show up again under
  // the weaker heading, since identical files also score as similar metadata.
  const seen = new Set(identical.flatMap((group) => group.copies.map((copy) => copy.id)));
  const similar: BookDuplicateGroup[] = similarityDuplicates
    .filter((group) => !group.books.every((book) => seen.has(book.id)))
    .map((group) => {
      const copies = bestFirst(group.books.map(toCopy));
      return {
        kind: 'similar' as const,
        key: `sim:${copies.map((copy) => copy.id).join('-')}`,
        similarity: group.similarity,
        copies,
      };
    });

  return {
    books: [...identical, ...similar],
    comics: comicLibrary.findComicDuplicateCandidates(),
  };
}

export interface ResolveBookDuplicateResult {
  success: boolean;
  /** Rows removed. */
  removed: number;
  /** Of those, how many had their file deleted too. */
  filesDeleted: number;
  error?: string;
}

/**
 * Keep one copy of a book and drop the rest.
 *
 * `deleteFiles` matters more here than it looks: the scanner tracks books by
 * path, so a row removed while its file stays put comes straight back on the
 * next scan. Leaving the file is still the safe default — the row is gone
 * until you next scan, and nothing on disk was destroyed to get there.
 */
export async function resolveBookDuplicateAction(
  keepId: number,
  dropIds: number[],
  deleteFiles = false
): Promise<ResolveBookDuplicateResult> {
  const toDrop = dropIds.filter((id) => id !== keepId);
  if (toDrop.length === 0) {
    return { success: false, removed: 0, filesDeleted: 0, error: 'Nothing to remove' };
  }

  let removed = 0;
  let filesDeleted = 0;
  for (const id of toDrop) {
    const result = await deleteBook(id, { deleteFiles });
    if (!result.success) {
      revalidatePath('/duplicates');
      revalidatePath('/books');
      return { success: false, removed, filesDeleted, error: result.error };
    }
    removed += 1;
    if (result.deletedFile) filesDeleted += 1;
  }

  revalidatePath('/duplicates');
  revalidatePath('/books');
  return { success: true, removed, filesDeleted };
}
