import { create } from 'zustand';
import { DownloadedBook } from '../types/komga';

interface DownloadState {
  downloads: Record<string, DownloadedBook>;
  activeDownloadId: string | null;
  progress: number; // 0-1

  setDownload: (bookId: string, download: DownloadedBook) => void;
  removeDownload: (bookId: string) => void;
  setActiveDownload: (bookId: string | null, progress?: number) => void;
}

export const useDownloadStore = create<DownloadState>((set) => ({
  downloads: {},
  activeDownloadId: null,
  progress: 0,

  setDownload: (bookId, download) =>
    set((state) => ({ downloads: { ...state.downloads, [bookId]: download } })),

  removeDownload: (bookId) =>
    set((state) => {
      const { [bookId]: _, ...rest } = state.downloads;
      return { downloads: rest };
    }),

  setActiveDownload: (bookId, progress = 0) =>
    set({ activeDownloadId: bookId, progress }),
}));
