import { useSettingsStore } from '../../src/stores/useSettingsStore';
import * as SecureStore from 'expo-secure-store';
import { _reset } from 'expo-secure-store';

const initialState = useSettingsStore.getState();

beforeEach(() => {
  _reset();
  useSettingsStore.setState(initialState);
});

describe('useSettingsStore', () => {
  describe('setAutoDelete', () => {
    it('updates state and persists JSON to SecureStore', async () => {
      useSettingsStore.getState().setAutoDelete(false);
      expect(useSettingsStore.getState().autoDeleteAfterReading).toBe(false);
      await new Promise((r) => setTimeout(r, 0));
      expect(await SecureStore.getItemAsync('settings_autoDelete')).toBe('false');
    });

    it('persists true value', async () => {
      useSettingsStore.getState().setAutoDelete(true);
      expect(useSettingsStore.getState().autoDeleteAfterReading).toBe(true);
      await new Promise((r) => setTimeout(r, 0));
      expect(await SecureStore.getItemAsync('settings_autoDelete')).toBe('true');
    });
  });

  describe('setShelvarrUrl', () => {
    it('updates state and persists to SecureStore', async () => {
      useSettingsStore.getState().setShelvarrUrl('http://shelvarr.local');
      expect(useSettingsStore.getState().shelvarrUrl).toBe('http://shelvarr.local');
      await new Promise((r) => setTimeout(r, 0));
      expect(await SecureStore.getItemAsync('settings_shelvarrUrl')).toBe('http://shelvarr.local');
    });
  });

  describe('setKapowarrUrl', () => {
    it('updates state and persists to SecureStore, trimming trailing slashes', async () => {
      useSettingsStore.getState().setKapowarrUrl('http://kapowarr.local/');
      expect(useSettingsStore.getState().kapowarrUrl).toBe('http://kapowarr.local');
      await new Promise((r) => setTimeout(r, 0));
      expect(await SecureStore.getItemAsync('settings_kapowarrUrl')).toBe('http://kapowarr.local');
    });
  });

  describe('loadSettings', () => {
    it('parses stored values', async () => {
      await SecureStore.setItemAsync('settings_autoDelete', 'false');
      await SecureStore.setItemAsync('settings_shelvarrUrl', 'http://shelvarr.local');
      await SecureStore.setItemAsync('settings_kapowarrUrl', 'http://kapowarr.local');

      await useSettingsStore.getState().loadSettings();
      const state = useSettingsStore.getState();
      expect(state.autoDeleteAfterReading).toBe(false);
      expect(state.shelvarrUrl).toBe('http://shelvarr.local');
      expect(state.kapowarrUrl).toBe('http://kapowarr.local');
    });

    it('defaults autoDelete to true and URLs to empty when missing', async () => {
      await useSettingsStore.getState().loadSettings();
      const state = useSettingsStore.getState();
      expect(state.autoDeleteAfterReading).toBe(true);
      expect(state.shelvarrUrl).toBe('');
      expect(state.kapowarrUrl).toBe('');
    });

    it('handles shelvarrUrl being null', async () => {
      await SecureStore.setItemAsync('settings_autoDelete', 'true');
      // shelvarrUrl not set
      await useSettingsStore.getState().loadSettings();
      expect(useSettingsStore.getState().shelvarrUrl).toBe('');
    });
  });
});
