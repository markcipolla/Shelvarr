import { useCallback } from 'react';
import { useReaderStore } from '../stores/useReaderStore';
import { useDownloadStore } from '../stores/useDownloadStore';
import { useComicDownloadStore } from '../stores/useComicDownloadStore';
import { syncProgress, syncComicProgress, flushProgress } from '../services/progressSync';

export interface BookReaderOpts {
  kind?: 'comic';
  issueId?: number;
}

export function useBookReader(bookId: string, opts?: BookReaderOpts) {
  const { setPage: setStorePage, startReading, stopReading } = useReaderStore();
  const download = useDownloadStore((s) => s.downloads[bookId]);
  const touchLastRead = useDownloadStore((s) => s.touchLastRead);
  const comicDownload = useComicDownloadStore((s) =>
    opts?.issueId !== undefined ? s.downloads[opts.issueId] : undefined
  );
  const touchComicLastRead = useComicDownloadStore((s) => s.touchLastRead);

  const isComic = opts?.kind === 'comic' && opts.issueId !== undefined;

  const onPageChange = useCallback(
    (page: number, totalPages: number) => {
      setStorePage(page);
      // Never treat progress as "completed" when the total is unknown (0) — a
      // bogus total would otherwise mark a freshly-opened comic finished and
      // hide it from the In Progress list.
      const completed = totalPages > 0 && page >= totalPages;
      if (isComic) {
        const issueId = opts!.issueId!;
        if (completed) {
          flushProgress(bookId);
          syncComicProgress(issueId, page, true, totalPages);
          flushProgress(bookId);
        } else {
          syncComicProgress(issueId, page, false, totalPages);
        }
      } else {
        if (completed) {
          // Flush immediately on completion so server updates on-deck
          flushProgress(bookId);
          syncProgress(bookId, page, true);
          flushProgress(bookId);
        } else {
          syncProgress(bookId, page, false);
        }
      }
    },
    [bookId, isComic, opts, setStorePage]
  );

  const onReaderExit = useCallback(async () => {
    // Final progress flush
    await flushProgress(bookId);
    stopReading();

    // Keep the file and note when it was last read. Closing the reader used to
    // delete anything not explicitly downloaded, which meant re-downloading a
    // book to read its next chapter; sweepExpiredDownloads() clears it instead
    // once it has gone DOWNLOAD_RETENTION_DAYS untouched.
    if (isComic && comicDownload) {
      touchComicLastRead(comicDownload.issueId);
    } else if (!isComic && download) {
      touchLastRead(bookId);
    }
  }, [
    bookId,
    download,
    comicDownload,
    isComic,
    stopReading,
    touchLastRead,
    touchComicLastRead,
  ]);

  return { onPageChange, onReaderExit, startReading };
}
