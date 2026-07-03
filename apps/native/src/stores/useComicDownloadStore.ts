import { create } from 'zustand';
import {
  documentDirectory,
  getInfoAsync,
  readAsStringAsync,
  writeAsStringAsync,
} from 'expo-file-system/legacy';
import type { KapowarrIssue } from '@shelvarr/types';

const MANIFEST_PATH = `${documentDirectory}comic-downloads.json`;

/**
 * A comic issue downloaded to *this device* for offline reading. Distinct from
 * `issue.files` on the server (which merely means Kapowarr grabbed the file
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
  /** true for explicit downloads; false for on-demand read-and-cache. */
  persisted?: boolean;
  /** Cached issue metadata so detail screens work offline. */
  issue?: KapowarrIssue;
  volumeTitle?: string;
}

interface ComicDownloadState {
  downloads: Record<number, DownloadedComic>;
  activeIssueId: number | null;
  progress: number; // 0-1
  hydrated: boolean;

  setDownload: (issueId: number, download: DownloadedComic) => void;
  removeDownload: (issueId: number) => void;
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
      const { [issueId]: _, ...rest } = state.downloads;
      persist(rest);
      return { downloads: rest };
    }),

  setActiveDownload: (issueId, progress = 0) =>
    set({ activeIssueId: issueId, progress }),

  loadDownloads: async () => {
    if (get().hydrated) return;
    try {
      const info = await getInfoAsync(MANIFEST_PATH);
      if (!info.exists) {
        set({ hydrated: true });
        return;
      }
      const raw = await readAsStringAsync(MANIFEST_PATH);
      const parsed = JSON.parse(raw) as Record<number, DownloadedComic>;
      set({ downloads: parsed || {}, hydrated: true });
    } catch (err) {
      console.warn('Failed to load comic downloads manifest:', err);
      set({ hydrated: true });
    }
  },
}));
