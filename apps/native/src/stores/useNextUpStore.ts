import { create } from 'zustand';
import {
  documentDirectory,
  getInfoAsync,
  readAsStringAsync,
  writeAsStringAsync,
} from 'expo-file-system/legacy';

const MANIFEST_PATH = `${documentDirectory}nextUpDismissed.json`;

/**
 * "Next Up" is computed server-side from reading progress, so there is no list
 * to delete from. Instead we persist a per-device set of dismissed items and
 * filter them out of the Home screen's Next Up sections. Books are keyed by
 * book id, comics by volume id. When the user actually reads the dismissed
 * entry it leaves Next Up on its own and a later, different entry (new id) is
 * unaffected, so stale dismissals are harmless.
 */
interface NextUpState {
  dismissedBooks: Record<string, true>;
  dismissedComics: Record<number, true>;
  hydrated: boolean;

  dismissBook: (bookId: string) => void;
  dismissComic: (volumeId: number) => void;
  loadDismissed: () => Promise<void>;
}

function persist(state: Pick<NextUpState, 'dismissedBooks' | 'dismissedComics'>): void {
  writeAsStringAsync(
    MANIFEST_PATH,
    JSON.stringify({
      books: Object.keys(state.dismissedBooks),
      comics: Object.keys(state.dismissedComics).map(Number),
    })
  ).catch((err) => console.warn('Failed to persist Next Up dismissals:', err));
}

export const useNextUpStore = create<NextUpState>((set, get) => ({
  dismissedBooks: {},
  dismissedComics: {},
  hydrated: false,

  dismissBook: (bookId) =>
    set((state) => {
      const next = { dismissedBooks: { ...state.dismissedBooks, [bookId]: true as const } };
      persist({ ...state, ...next });
      return next;
    }),

  dismissComic: (volumeId) =>
    set((state) => {
      const next = { dismissedComics: { ...state.dismissedComics, [volumeId]: true as const } };
      persist({ ...state, ...next });
      return next;
    }),

  loadDismissed: async () => {
    if (get().hydrated) return;
    try {
      const info = await getInfoAsync(MANIFEST_PATH);
      if (!info.exists) {
        set({ hydrated: true });
        return;
      }
      const raw = await readAsStringAsync(MANIFEST_PATH);
      const parsed = JSON.parse(raw) as { books?: string[]; comics?: number[] };
      const dismissedBooks: Record<string, true> = {};
      for (const id of parsed.books ?? []) dismissedBooks[id] = true;
      const dismissedComics: Record<number, true> = {};
      for (const id of parsed.comics ?? []) dismissedComics[id] = true;
      set({ dismissedBooks, dismissedComics, hydrated: true });
    } catch (err) {
      console.warn('Failed to load Next Up dismissals:', err);
      set({ hydrated: true });
    }
  },
}));
