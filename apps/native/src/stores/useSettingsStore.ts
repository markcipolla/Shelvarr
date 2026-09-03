import { create } from 'zustand';
import * as SecureStore from 'expo-secure-store';
import { resetApiClient } from '../services/api/client';

interface SettingsState {
  autoDeleteAfterReading: boolean;
  shelvarrUrl: string;
  /** False until the first-run wizard has been finished or skipped. */
  onboardingComplete: boolean;
  /** True once `loadSettings` has read what was stored. */
  loaded: boolean;
  setAutoDelete: (value: boolean) => void;
  setShelvarrUrl: (value: string) => void;
  setOnboardingComplete: (value: boolean) => void;
  loadSettings: () => Promise<void>;
}

export const useSettingsStore = create<SettingsState>((set) => ({
  autoDeleteAfterReading: true,
  shelvarrUrl: '',
  onboardingComplete: false,
  loaded: false,
  setAutoDelete: (value) => {
    set({ autoDeleteAfterReading: value });
    SecureStore.setItemAsync('settings_autoDelete', JSON.stringify(value));
  },
  setShelvarrUrl: (value) => {
    const url = value.replace(/\/+$/, '');
    set({ shelvarrUrl: url });
    SecureStore.setItemAsync('settings_shelvarrUrl', url);
    resetApiClient();
  },
  setOnboardingComplete: (value) => {
    set({ onboardingComplete: value });
    SecureStore.setItemAsync('settings_onboardingComplete', JSON.stringify(value));
  },
  loadSettings: async () => {
    const autoDelete = await SecureStore.getItemAsync('settings_autoDelete');
    const shelvarrUrl = await SecureStore.getItemAsync('settings_shelvarrUrl');
    const onboardingComplete = await SecureStore.getItemAsync('settings_onboardingComplete');
    set({
      autoDeleteAfterReading: autoDelete ? JSON.parse(autoDelete) : true,
      shelvarrUrl: shelvarrUrl || '',
      // Installs that predate the wizard already have a server address, and
      // sending them back through setup would be a step backwards.
      onboardingComplete: onboardingComplete
        ? JSON.parse(onboardingComplete)
        : Boolean(shelvarrUrl),
      loaded: true,
    });
  },
}));
