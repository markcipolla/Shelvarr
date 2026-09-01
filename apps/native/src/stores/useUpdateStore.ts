import { create } from 'zustand';
import * as SecureStore from 'expo-secure-store';
import {
  AvailableUpdate,
  checkForUpdate,
  downloadUpdate,
  installUpdate,
} from '../services/updates';

const DISMISSED_KEY = 'update_dismissedVersion';

export type UpdateStatus =
  | 'idle'
  | 'checking'
  | 'available'
  | 'downloading'
  | 'installing'
  | 'error';

interface UpdateState {
  status: UpdateStatus;
  /** Latest release newer than this build, even when the banner is dismissed. */
  update: AvailableUpdate | null;
  /** Download progress in 0..1, only meaningful while downloading. */
  progress: number;
  error: string | null;
  /** Set by a successful check that found nothing newer. */
  upToDate: boolean;
  /** Version the user tapped "Later" on; suppresses the banner for it. */
  dismissedVersion: string | null;
  loadDismissed: () => Promise<void>;
  check: (options?: { silent?: boolean }) => Promise<void>;
  startUpdate: () => Promise<void>;
  dismiss: () => void;
}

export const useUpdateStore = create<UpdateState>((set, get) => ({
  status: 'idle',
  update: null,
  progress: 0,
  error: null,
  upToDate: false,
  dismissedVersion: null,

  loadDismissed: async () => {
    try {
      const dismissedVersion = await SecureStore.getItemAsync(DISMISSED_KEY);
      set({ dismissedVersion: dismissedVersion || null });
    } catch {
      // Nothing readable in the keystore; treat it as "never dismissed".
    }
  },

  check: async ({ silent = false } = {}) => {
    if (get().status === 'downloading' || get().status === 'installing') return;

    set({ status: 'checking', error: null, upToDate: false });
    try {
      const update = await checkForUpdate();
      if (!update) {
        set({ status: 'idle', update: null, upToDate: true });
        return;
      }
      // A launch check honours "Later"; an explicit check from Settings does
      // not — asking again is the point of tapping the button.
      const suppressed = silent && get().dismissedVersion === update.version;
      set({ status: suppressed ? 'idle' : 'available', update });
    } catch (err: any) {
      // The launch check runs offline all the time; failing it silently keeps
      // the app from greeting every cold start with an error.
      if (silent) {
        set({ status: 'idle' });
        return;
      }
      set({ status: 'error', error: err?.message || 'Could not check for updates' });
    }
  },

  startUpdate: async () => {
    const update = get().update;
    if (!update) return;

    set({ status: 'downloading', progress: 0, error: null });
    try {
      const fileUri = await downloadUpdate(update, (progress) => set({ progress }));
      set({ status: 'installing' });
      await installUpdate(fileUri);
      // The installer takes over from here. If the user backs out we land back
      // on the banner offering the same version again.
      set({ status: 'available' });
    } catch (err: any) {
      set({ status: 'error', error: err?.message || 'Update failed' });
    }
  },

  dismiss: () => {
    const version = get().update?.version ?? null;
    set({ status: 'idle', dismissedVersion: version });
    if (version) {
      SecureStore.setItemAsync(DISMISSED_KEY, version);
    }
  },
}));
