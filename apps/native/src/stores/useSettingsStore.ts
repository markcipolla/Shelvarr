import { create } from 'zustand';
import * as SecureStore from 'expo-secure-store';

interface SettingsState {
  autoDeleteAfterReading: boolean;
  shelvarrUrl: string;
  setAutoDelete: (value: boolean) => void;
  setShelvarrUrl: (value: string) => void;
  loadSettings: () => Promise<void>;
}

export const useSettingsStore = create<SettingsState>((set) => ({
  autoDeleteAfterReading: true,
  shelvarrUrl: '',
  setAutoDelete: (value) => {
    set({ autoDeleteAfterReading: value });
    SecureStore.setItemAsync('settings_autoDelete', JSON.stringify(value));
  },
  setShelvarrUrl: (value) => {
    set({ shelvarrUrl: value });
    SecureStore.setItemAsync('settings_shelvarrUrl', value);
  },
  loadSettings: async () => {
    const autoDelete = await SecureStore.getItemAsync('settings_autoDelete');
    const shelvarrUrl = await SecureStore.getItemAsync('settings_shelvarrUrl');
    set({
      autoDeleteAfterReading: autoDelete ? JSON.parse(autoDelete) : true,
      shelvarrUrl: shelvarrUrl || '',
    });
  },
}));
