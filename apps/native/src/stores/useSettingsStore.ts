import { create } from 'zustand';
import * as SecureStore from 'expo-secure-store';

interface SettingsState {
  autoDeleteAfterReading: boolean;
  setAutoDelete: (value: boolean) => void;
  loadSettings: () => Promise<void>;
}

export const useSettingsStore = create<SettingsState>((set) => ({
  autoDeleteAfterReading: true,
  setAutoDelete: (value) => {
    set({ autoDeleteAfterReading: value });
    SecureStore.setItemAsync('settings_autoDelete', JSON.stringify(value));
  },
  loadSettings: async () => {
    const autoDelete = await SecureStore.getItemAsync('settings_autoDelete');
    set({
      autoDeleteAfterReading: autoDelete ? JSON.parse(autoDelete) : true,
    });
  },
}));
