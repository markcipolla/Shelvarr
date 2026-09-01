jest.mock('../../src/services/updates', () => ({
  checkForUpdate: jest.fn(),
  downloadUpdate: jest.fn(),
  installUpdate: jest.fn(),
}));

import * as SecureStore from 'expo-secure-store';
// `_reset` only exists on the mock (jest maps expo-secure-store to it).
import { _reset } from '../../__mocks__/expo-secure-store';
import { useUpdateStore } from '../../src/stores/useUpdateStore';
import { AvailableUpdate } from '../../src/services/updates';

const updatesMock = jest.requireMock('../../src/services/updates');
const checkForUpdate = updatesMock.checkForUpdate as jest.Mock;
const downloadUpdate = updatesMock.downloadUpdate as jest.Mock;
const installUpdate = updatesMock.installUpdate as jest.Mock;

const available: AvailableUpdate = {
  version: '1.2.0',
  notes: 'Notes',
  apkUrl: 'https://x/app.apk',
  apkSize: 100,
  releaseUrl: 'https://x/release',
};

describe('useUpdateStore', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useUpdateStore.setState({
      status: 'idle',
      update: null,
      progress: 0,
      error: null,
      upToDate: false,
      dismissedVersion: null,
    });
    _reset();
    downloadUpdate.mockResolvedValue('file:///apk');
    installUpdate.mockResolvedValue(undefined);
  });

  describe('loadDismissed', () => {
    it('restores the dismissed version from secure storage', async () => {
      await SecureStore.setItemAsync('update_dismissedVersion', '1.1.0');

      await useUpdateStore.getState().loadDismissed();

      expect(useUpdateStore.getState().dismissedVersion).toBe('1.1.0');
    });

    it('falls back to null when the stored value is empty', async () => {
      await SecureStore.setItemAsync('update_dismissedVersion', '');

      await useUpdateStore.getState().loadDismissed();

      expect(useUpdateStore.getState().dismissedVersion).toBeNull();
    });

    it('ignores a keystore failure', async () => {
      const spy = jest
        .spyOn(SecureStore, 'getItemAsync')
        .mockRejectedValue(new Error('locked'));

      await expect(useUpdateStore.getState().loadDismissed()).resolves.toBeUndefined();
      expect(useUpdateStore.getState().dismissedVersion).toBeNull();
      spy.mockRestore();
    });
  });

  describe('check', () => {
    it('marks the app up to date when there is no newer release', async () => {
      checkForUpdate.mockResolvedValue(null);

      await useUpdateStore.getState().check();

      expect(useUpdateStore.getState()).toMatchObject({
        status: 'idle',
        update: null,
        upToDate: true,
      });
    });

    it('surfaces an available update', async () => {
      checkForUpdate.mockResolvedValue(available);

      await useUpdateStore.getState().check();

      expect(useUpdateStore.getState()).toMatchObject({
        status: 'available',
        update: available,
      });
    });

    it('keeps a silent check quiet for a version the user dismissed', async () => {
      checkForUpdate.mockResolvedValue(available);
      useUpdateStore.setState({ dismissedVersion: '1.2.0' });

      await useUpdateStore.getState().check({ silent: true });

      expect(useUpdateStore.getState()).toMatchObject({
        status: 'idle',
        update: available,
      });
    });

    it('still shows a dismissed version when the user checks explicitly', async () => {
      checkForUpdate.mockResolvedValue(available);
      useUpdateStore.setState({ dismissedVersion: '1.2.0' });

      await useUpdateStore.getState().check();

      expect(useUpdateStore.getState().status).toBe('available');
    });

    it('shows a silent check when a different version was dismissed', async () => {
      checkForUpdate.mockResolvedValue(available);
      useUpdateStore.setState({ dismissedVersion: '1.1.0' });

      await useUpdateStore.getState().check({ silent: true });

      expect(useUpdateStore.getState().status).toBe('available');
    });

    it('swallows failures during a silent check', async () => {
      checkForUpdate.mockRejectedValue(new Error('offline'));

      await useUpdateStore.getState().check({ silent: true });

      expect(useUpdateStore.getState()).toMatchObject({ status: 'idle', error: null });
    });

    it('reports failures during an explicit check', async () => {
      checkForUpdate.mockRejectedValue(new Error('GitHub returned 403'));

      await useUpdateStore.getState().check();

      expect(useUpdateStore.getState()).toMatchObject({
        status: 'error',
        error: 'GitHub returned 403',
      });
    });

    it('falls back to a generic message when the failure has none', async () => {
      checkForUpdate.mockRejectedValue({});

      await useUpdateStore.getState().check();

      expect(useUpdateStore.getState().error).toBe('Could not check for updates');
    });

    it.each(['downloading', 'installing'] as const)(
      'does not re-check while %s',
      async (status) => {
        useUpdateStore.setState({ status });

        await useUpdateStore.getState().check();

        expect(checkForUpdate).not.toHaveBeenCalled();
        expect(useUpdateStore.getState().status).toBe(status);
      }
    );
  });

  describe('startUpdate', () => {
    it('does nothing without a pending update', async () => {
      await useUpdateStore.getState().startUpdate();

      expect(downloadUpdate).not.toHaveBeenCalled();
      expect(useUpdateStore.getState().status).toBe('idle');
    });

    it('downloads, tracks progress, then launches the installer', async () => {
      useUpdateStore.setState({ update: available, status: 'available' });
      downloadUpdate.mockImplementation(async (_update: AvailableUpdate, onProgress: (p: number) => void) => {
        onProgress(0.5);
        return 'file:///apk';
      });

      await useUpdateStore.getState().startUpdate();

      expect(downloadUpdate).toHaveBeenCalledWith(available, expect.any(Function));
      expect(installUpdate).toHaveBeenCalledWith('file:///apk');
      expect(useUpdateStore.getState()).toMatchObject({ status: 'available', progress: 0.5 });
    });

    it('reports a download failure', async () => {
      useUpdateStore.setState({ update: available, status: 'available' });
      downloadUpdate.mockRejectedValue(new Error('Update download failed (HTTP 404)'));

      await useUpdateStore.getState().startUpdate();

      expect(useUpdateStore.getState()).toMatchObject({
        status: 'error',
        error: 'Update download failed (HTTP 404)',
      });
      expect(installUpdate).not.toHaveBeenCalled();
    });

    it('falls back to a generic message when the failure has none', async () => {
      useUpdateStore.setState({ update: available, status: 'available' });
      installUpdate.mockRejectedValue({});

      await useUpdateStore.getState().startUpdate();

      expect(useUpdateStore.getState().error).toBe('Update failed');
    });
  });

  describe('dismiss', () => {
    it('remembers the dismissed version', async () => {
      useUpdateStore.setState({ update: available, status: 'available' });

      useUpdateStore.getState().dismiss();

      expect(useUpdateStore.getState()).toMatchObject({
        status: 'idle',
        dismissedVersion: '1.2.0',
      });
      await new Promise((r) => setTimeout(r, 0));
      expect(await SecureStore.getItemAsync('update_dismissedVersion')).toBe('1.2.0');
    });

    it('does not write anything when there is no update to dismiss', async () => {
      useUpdateStore.getState().dismiss();

      expect(useUpdateStore.getState().dismissedVersion).toBeNull();
      await new Promise((r) => setTimeout(r, 0));
      expect(await SecureStore.getItemAsync('update_dismissedVersion')).toBeNull();
    });
  });
});
