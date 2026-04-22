import { create } from 'zustand';
import {
  documentDirectory,
  getInfoAsync,
  readAsStringAsync,
  writeAsStringAsync,
} from 'expo-file-system/legacy';
import { DownloadedBook } from '../types/komga';

const MANIFEST_PATH = `${documentDirectory}downloads.json`;

interface DownloadState {
  downloads: Record<string, DownloadedBook>;
  activeDownloadId: string | null;
  progress: number; // 0-1
  hydrated: boolean;

  setDownload: (bookId: string, download: DownloadedBook) => void;
  removeDownload: (bookId: string) => void;
  setActiveDownload: (bookId: string | null, progress?: number) => void;
  loadDownloads: () => Promise<void>;
}

async function persist(downloads: Record<string, DownloadedBook>): Promise<void> {
  try {
    await writeAsStringAsync(MANIFEST_PATH, JSON.stringify(downloads));
  } catch (err) {
    console.warn('Failed to persist downloads manifest:', err);
  }
}

export const useDownloadStore = create<DownloadState>((set, get) => ({
  downloads: {},
  activeDownloadId: null,
  progress: 0,
  hydrated: false,

  setDownload: (bookId, download) =>
    set((state) => {
      const next = { ...state.downloads, [bookId]: download };
      persist(next);
      return { downloads: next };
    }),

  removeDownload: (bookId) =>
    set((state) => {
      const { [bookId]: _, ...rest } = state.downloads;
      persist(rest);
      return { downloads: rest };
    }),

  setActiveDownload: (bookId, progress = 0) =>
    set({ activeDownloadId: bookId, progress }),

  loadDownloads: async () => {
    if (get().hydrated) return;
    try {
      const info = await getInfoAsync(MANIFEST_PATH);
      if (!info.exists) {
        set({ hydrated: true });
        return;
      }
      const raw = await readAsStringAsync(MANIFEST_PATH);
      const parsed = JSON.parse(raw) as Record<string, DownloadedBook>;
      set({ downloads: parsed || {}, hydrated: true });
    } catch (err) {
      console.warn('Failed to load downloads manifest:', err);
      set({ hydrated: true });
    }
  },
}));
