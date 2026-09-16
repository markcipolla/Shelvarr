import { create } from 'zustand';
import {
  documentDirectory,
  getInfoAsync,
  readAsStringAsync,
  writeAsStringAsync,
} from 'expo-file-system/legacy';
import { DownloadedBook } from '../types/api';

const MANIFEST_PATH = `${documentDirectory}downloads.json`;

interface DownloadState {
  downloads: Record<string, DownloadedBook>;
  activeDownloadId: string | null;
  progress: number; // 0-1
  hydrated: boolean;

  setDownload: (bookId: string, download: DownloadedBook) => void;
  removeDownload: (bookId: string) => void;
  touchLastRead: (bookId: string, at?: number) => void;
  clearDownloads: () => void;
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

type SetState = (
  partial: Partial<DownloadState> | ((state: DownloadState) => Partial<DownloadState>)
) => void;

let inFlight: Promise<void> | null = null;

async function hydrate(set: SetState): Promise<void> {
  try {
    const info = await getInfoAsync(MANIFEST_PATH);
    if (!info.exists) {
      set({ hydrated: true });
      return;
    }
    const raw = await readAsStringAsync(MANIFEST_PATH);
    const parsed = (JSON.parse(raw) || {}) as Record<string, DownloadedBook>;
    // Merge under what is already in memory rather than replacing it. Hydration
    // is kicked off unawaited at startup, so a book opened before it lands has
    // already recorded a download that the stored manifest predates.
    set((state) => ({
      downloads: { ...parsed, ...state.downloads },
      hydrated: true,
    }));
  } catch (err) {
    console.warn('Failed to load downloads manifest:', err);
    set({ hydrated: true });
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
      const { [bookId]: _removed, ...rest } = state.downloads;
      persist(rest);
      return { downloads: rest };
    }),

  touchLastRead: (bookId, at = Date.now()) =>
    set((state) => {
      const existing = state.downloads[bookId];
      if (!existing) return state;
      const next = { ...state.downloads, [bookId]: { ...existing, lastReadAt: at } };
      persist(next);
      return { downloads: next };
    }),

  clearDownloads: () =>
    set(() => {
      persist({});
      return { downloads: {} };
    }),

  setActiveDownload: (bookId, progress = 0) =>
    set({ activeDownloadId: bookId, progress }),

  loadDownloads: () => {
    if (get().hydrated) return Promise.resolve();
    // Share one read: a second caller arriving mid-flight waits for the first
    // rather than starting its own, which would race to overwrite `downloads`.
    inFlight ??= hydrate(set).finally(() => {
      inFlight = null;
    });
    return inFlight;
  },
}));
