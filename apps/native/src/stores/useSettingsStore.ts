import { create } from 'zustand';
import * as SecureStore from 'expo-secure-store';
import { resetApiClient } from '../services/api/client';

interface SettingsState {
  autoDeleteAfterReading: boolean;
  shelvarrUrl: string;
  kapowarrUrl: string;
  setAutoDelete: (value: boolean) => void;
  setShelvarrUrl: (value: string) => void;
  setKapowarrUrl: (value: string) => void;
  loadSettings: () => Promise<void>;
}

export const useSettingsStore = create<SettingsState>((set) => ({
  autoDeleteAfterReading: true,
  shelvarrUrl: '',
  kapowarrUrl: '',
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
  setKapowarrUrl: (value) => {
    const url = value.replace(/\/+$/, '');
    set({ kapowarrUrl: url });
    SecureStore.setItemAsync('settings_kapowarrUrl', url);
  },
  loadSettings: async () => {
    const autoDelete = await SecureStore.getItemAsync('settings_autoDelete');
    const shelvarrUrl = await SecureStore.getItemAsync('settings_shelvarrUrl');
    const kapowarrUrl = await SecureStore.getItemAsync('settings_kapowarrUrl');
    set({
      autoDeleteAfterReading: autoDelete ? JSON.parse(autoDelete) : true,
      shelvarrUrl: shelvarrUrl || '',
      kapowarrUrl: kapowarrUrl || '',
    });
  },
}));
