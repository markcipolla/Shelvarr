import { useCallback } from 'react';
import { useReaderStore } from '../stores/useReaderStore';
import { useSettingsStore } from '../stores/useSettingsStore';
import { useDownloadStore } from '../stores/useDownloadStore';
import { useComicDownloadStore } from '../stores/useComicDownloadStore';
import { syncProgress, syncComicProgress, flushProgress } from '../services/progressSync';
import { deleteBookFiles } from '../services/fileManager';
import { removeDownloadedComic } from '../services/comicReader';
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
  const comicDownload = useComicDownloadStore((s) =>
    opts?.issueId !== undefined ? s.downloads[opts.issueId] : undefined
  );

  const isComic = opts?.kind === 'comic' && opts.issueId !== undefined;

  const onPageChange = useCallback(
    (page: number, totalPages: number) => {
      setStorePage(page);
      const completed = page >= totalPages;
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

    // Auto-delete if enabled (but never delete explicitly-downloaded items)
    if (autoDelete) {
      if (isComic && comicDownload && !comicDownload.persisted) {
        try {
          await removeDownloadedComic(comicDownload.issueId);
        } catch (err) {
          console.error('Failed to delete comic files:', err);
        }
      } else if (!isComic && download && !download.persisted) {
        try {
          await deleteBookFiles(bookId, getFileExtension(download.format));
          removeDownload(bookId);
        } catch (err) {
          console.error('Failed to delete book files:', err);
        }
      }
    }
  }, [bookId, autoDelete, download, comicDownload, isComic, stopReading, removeDownload]);

  return { onPageChange, onReaderExit, startReading };
}
