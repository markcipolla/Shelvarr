import { useCallback } from 'react';
import { useReaderStore } from '../stores/useReaderStore';
import { useSettingsStore } from '../stores/useSettingsStore';
import { useDownloadStore } from '../stores/useDownloadStore';
import { syncProgress, syncComicProgress, flushProgress } from '../services/progressSync';
import { deleteBookFiles } from '../services/fileManager';
import { getFileExtension } from '../utils/fileTypes';

export interface BookReaderOpts {
  kind?: 'comic';
  issueId?: number;
}

export function useBookReader(bookId: string, opts?: BookReaderOpts) {
  const { setPage: setStorePage, startReading, stopReading } = useReaderStore();
  const autoDelete = useSettingsStore((s) => s.autoDeleteAfterReading);
  const download = useDownloadStore((s) => s.downloads[bookId]);
  const removeDownload = useDownloadStore((s) => s.removeDownload);

  const isComic = opts?.kind === 'comic' && opts.issueId !== undefined;

  const onPageChange = useCallback(
    (page: number, totalPages: number) => {
      setStorePage(page);
      const completed = page >= totalPages;
      if (isComic) {
        const issueId = opts!.issueId!;
        if (completed) {
          flushProgress(bookId);
          syncComicProgress(issueId, page, true);
          flushProgress(bookId);
        } else {
          syncComicProgress(issueId, page, false);
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

    // Auto-delete if enabled (but never delete explicitly-downloaded books)
    if (autoDelete && download && !download.persisted) {
      try {
        await deleteBookFiles(bookId, getFileExtension(download.format));
        removeDownload(bookId);
      } catch (err) {
        console.error('Failed to delete book files:', err);
      }
    }
  }, [bookId, autoDelete, download, stopReading, removeDownload]);

  return { onPageChange, onReaderExit, startReading };
}
