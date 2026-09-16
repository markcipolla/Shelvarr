import { create } from 'zustand';
import {
  documentDirectory,
  getInfoAsync,
  readAsStringAsync,
  writeAsStringAsync,
} from 'expo-file-system/legacy';
import type { ComicIssueSummary } from '@shelvarr/types';

const MANIFEST_PATH = `${documentDirectory}comic-downloads.json`;

/**
 * A comic issue downloaded to *this device* for offline reading. Distinct from
 * `issue.files` on the server (which merely means the server has the file
 * into the library and is shared across every device).
 */
export interface DownloadedComic {
  issueId: number;
  volumeId: number;
  kind: 'pdf' | 'images';
  /** Local path of the downloaded PDF (kind === 'pdf'). */
  filePath?: string;
  /** Local directory of extracted page images (kind === 'images'). */
  extractedDir?: string;
  totalPages?: number;
  downloadedAt: number;
  /** Last time the reader was closed on this issue; drives cache expiry. */
  lastReadAt?: number;
  /** true for explicit downloads; false for on-demand read-and-cache. */
  persisted?: boolean;
  /** Cached issue metadata so detail screens work offline. */
  issue?: ComicIssueSummary;
  volumeTitle?: string;
}

interface ComicDownloadState {
  downloads: Record<number, DownloadedComic>;
  activeIssueId: number | null;
  progress: number; // 0-1
  hydrated: boolean;

  setDownload: (issueId: number, download: DownloadedComic) => void;
  removeDownload: (issueId: number) => void;
  touchLastRead: (issueId: number, at?: number) => void;
  clearDownloads: () => void;
  setActiveDownload: (issueId: number | null, progress?: number) => void;
  loadDownloads: () => Promise<void>;
}

async function persist(downloads: Record<number, DownloadedComic>): Promise<void> {
  try {
    await writeAsStringAsync(MANIFEST_PATH, JSON.stringify(downloads));
  } catch (err) {
    console.warn('Failed to persist comic downloads manifest:', err);
  }
}

type SetState = (
  partial:
    | Partial<ComicDownloadState>
    | ((state: ComicDownloadState) => Partial<ComicDownloadState>)
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
    const parsed = (JSON.parse(raw) || {}) as Record<number, DownloadedComic>;
    // Merge under what is already in memory rather than replacing it. Hydration
    // is kicked off unawaited at startup, so an issue opened before it lands
    // has already recorded a download that the stored manifest predates.
    set((state) => ({
      downloads: { ...parsed, ...state.downloads },
      hydrated: true,
    }));
  } catch (err) {
    console.warn('Failed to load comic downloads manifest:', err);
    set({ hydrated: true });
  }
}

export const useComicDownloadStore = create<ComicDownloadState>((set, get) => ({
  downloads: {},
  activeIssueId: null,
  progress: 0,
  hydrated: false,

  setDownload: (issueId, download) =>
    set((state) => {
      const next = { ...state.downloads, [issueId]: download };
      persist(next);
      return { downloads: next };
    }),

  removeDownload: (issueId) =>
    set((state) => {
      const { [issueId]: _removed, ...rest } = state.downloads;
      persist(rest);
      return { downloads: rest };
    }),

  touchLastRead: (issueId, at = Date.now()) =>
    set((state) => {
      const existing = state.downloads[issueId];
      if (!existing) return state;
      const next = { ...state.downloads, [issueId]: { ...existing, lastReadAt: at } };
      persist(next);
      return { downloads: next };
    }),

  clearDownloads: () =>
    set(() => {
      persist({});
      return { downloads: {} };
    }),

  setActiveDownload: (issueId, progress = 0) =>
    set({ activeIssueId: issueId, progress }),

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
