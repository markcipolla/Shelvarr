jest.mock('expo-file-system/legacy', () => ({
  cacheDirectory: 'file:///mock-cache-dir/',
  deleteAsync: jest.fn().mockResolvedValue(undefined),
  getContentUriAsync: jest.fn().mockResolvedValue('content://mock/apk'),
  createDownloadResumable: jest.fn().mockReturnValue({
    downloadAsync: jest.fn().mockResolvedValue({ uri: 'file:///apk', status: 200 }),
  }),
}));

jest.mock('expo-intent-launcher', () => ({
  startActivityAsync: jest.fn().mockResolvedValue({ resultCode: -1 }),
}));

import { Platform } from 'react-native';
import {
  AvailableUpdate,
  checkForUpdate,
  downloadUpdate,
  installUpdate,
  isNewerVersion,
} from '../../src/services/updates';
import { APP_VERSION, UPDATE_LATEST_RELEASE_URL } from '../../src/utils/constants';

const fsMock = jest.requireMock('expo-file-system/legacy');
const createDownloadResumable = fsMock.createDownloadResumable as jest.Mock;
const deleteAsync = fsMock.deleteAsync as jest.Mock;
const getContentUriAsync = fsMock.getContentUriAsync as jest.Mock;
const startActivityAsync = jest.requireMock('expo-intent-launcher')
  .startActivityAsync as jest.Mock;

const update: AvailableUpdate = {
  version: '9.9.9',
  notes: 'Fixes',
  apkUrl: 'https://example.test/shelvarr-9.9.9.apk',
  apkSize: 1000,
  releaseUrl: 'https://example.test/release',
};

function mockRelease(body: unknown, ok = true, status = 200) {
  (global.fetch as jest.Mock).mockResolvedValue({
    ok,
    status,
    json: jest.fn().mockResolvedValue(body),
  });
}

function mockDownload(result: unknown) {
  const downloadAsync = jest.fn().mockResolvedValue(result);
  createDownloadResumable.mockReturnValue({ downloadAsync });
  return downloadAsync;
}

describe('updates service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    Platform.OS = 'android';
    global.fetch = jest.fn();
    deleteAsync.mockResolvedValue(undefined);
    getContentUriAsync.mockResolvedValue('content://mock/apk');
  });

  describe('isNewerVersion', () => {
    it.each([
      ['1.0.1', '1.0.0', true],
      ['1.1.0', '1.0.9', true],
      ['2.0.0', '1.9.9', true],
      ['1.0.0', '1.0.0', false],
      ['0.9.0', '1.0.0', false],
      ['1.0', '1.0.0', false],
      ['1.0.1', '1.0', true],
    ])('%s vs %s -> %s', (candidate, current, expected) => {
      expect(isNewerVersion(candidate, current)).toBe(expected);
    });

    it('ignores a leading v and prerelease suffixes', () => {
      expect(isNewerVersion('v1.2.0', '1.1.0')).toBe(true);
      expect(isNewerVersion('1.2.0-rc.1', '1.2.0')).toBe(false);
    });

    it('treats non-numeric segments as zero', () => {
      expect(isNewerVersion('1.x.0', '1.0.0')).toBe(false);
      expect(isNewerVersion('1.1.0', '1.x.0')).toBe(true);
    });
  });

  describe('checkForUpdate', () => {
    it('returns null on non-Android platforms without calling GitHub', async () => {
      Platform.OS = 'ios';

      await expect(checkForUpdate()).resolves.toBeNull();
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('throws when GitHub responds with an error', async () => {
      mockRelease(null, false, 403);

      await expect(checkForUpdate()).rejects.toThrow('GitHub returned 403');
      expect(global.fetch).toHaveBeenCalledWith(UPDATE_LATEST_RELEASE_URL, {
        headers: { Accept: 'application/vnd.github+json' },
      });
    });

    it('returns null when the response has no tag', async () => {
      mockRelease({});

      await expect(checkForUpdate()).resolves.toBeNull();
    });

    it('returns null when the response body is null', async () => {
      mockRelease(null);

      await expect(checkForUpdate()).resolves.toBeNull();
    });

    it('returns null when the release is not newer than the running build', async () => {
      mockRelease({ tag_name: `v${APP_VERSION}`, assets: [] });

      await expect(checkForUpdate()).resolves.toBeNull();
    });

    it('returns null when a newer release has no APK attached', async () => {
      mockRelease({
        tag_name: 'v99.0.0',
        assets: [{ name: 'source.zip', browser_download_url: 'https://x/y.zip', size: 1 }],
      });

      await expect(checkForUpdate()).resolves.toBeNull();
    });

    it('returns null when a newer release has no assets key at all', async () => {
      mockRelease({ tag_name: 'v99.0.0' });

      await expect(checkForUpdate()).resolves.toBeNull();
    });

    it('returns the APK asset of a newer release', async () => {
      mockRelease({
        tag_name: 'v99.0.0',
        body: '  Shiny things  ',
        html_url: 'https://github.test/release',
        assets: [
          { name: 'notes.txt', browser_download_url: 'https://x/notes.txt', size: 2 },
          {
            name: 'shelvarr-99.0.0.APK',
            browser_download_url: 'https://x/app.apk',
            size: 4096,
          },
        ],
      });

      await expect(checkForUpdate()).resolves.toEqual({
        version: '99.0.0',
        notes: 'Shiny things',
        apkUrl: 'https://x/app.apk',
        apkSize: 4096,
        releaseUrl: 'https://github.test/release',
      });
    });

    it('defaults notes, size and release url when GitHub omits them', async () => {
      mockRelease({
        tag_name: '99.0.0',
        assets: [{ name: 'app.apk', browser_download_url: 'https://x/app.apk' }],
      });

      await expect(checkForUpdate()).resolves.toEqual({
        version: '99.0.0',
        notes: '',
        apkUrl: 'https://x/app.apk',
        apkSize: 0,
        releaseUrl: '',
      });
    });

    it('skips assets with no name', async () => {
      mockRelease({
        tag_name: '99.0.0',
        assets: [
          { browser_download_url: 'https://x/nameless' },
          { name: 'app.apk', browser_download_url: 'https://x/app.apk', size: 1 },
        ],
      });

      await expect(checkForUpdate()).resolves.toMatchObject({ apkUrl: 'https://x/app.apk' });
    });
  });

  describe('downloadUpdate', () => {
    it('downloads to the cache directory and returns the file uri', async () => {
      mockDownload({ uri: 'file:///mock-cache-dir/shelvarr-9.9.9.apk', status: 200 });

      await expect(downloadUpdate(update)).resolves.toBe(
        'file:///mock-cache-dir/shelvarr-9.9.9.apk'
      );
      expect(deleteAsync).toHaveBeenCalledWith('file:///mock-cache-dir/shelvarr-9.9.9.apk', {
        idempotent: true,
      });
      expect(createDownloadResumable).toHaveBeenCalledWith(
        update.apkUrl,
        'file:///mock-cache-dir/shelvarr-9.9.9.apk',
        {},
        expect.any(Function)
      );
    });

    it('continues when the stale file cannot be removed', async () => {
      deleteAsync.mockRejectedValueOnce(new Error('locked'));
      mockDownload({ uri: 'file:///apk', status: 200 });

      await expect(downloadUpdate(update)).resolves.toBe('file:///apk');
    });

    it('accepts a result without an HTTP status', async () => {
      mockDownload({ uri: 'file:///apk' });

      await expect(downloadUpdate(update)).resolves.toBe('file:///apk');
    });

    it('reports progress against the Content-Length when present', async () => {
      mockDownload({ uri: 'file:///apk', status: 200 });
      const onProgress = jest.fn();

      await downloadUpdate(update, onProgress);
      const callback = createDownloadResumable.mock.calls[0][3];

      callback({ totalBytesWritten: 50, totalBytesExpectedToWrite: 200 });
      expect(onProgress).toHaveBeenCalledWith(0.25);
    });

    it('falls back to the release asset size when Content-Length is missing', async () => {
      mockDownload({ uri: 'file:///apk', status: 200 });
      const onProgress = jest.fn();

      await downloadUpdate(update, onProgress);
      const callback = createDownloadResumable.mock.calls[0][3];

      callback({ totalBytesWritten: 500, totalBytesExpectedToWrite: -1 });
      expect(onProgress).toHaveBeenCalledWith(0.5);
    });

    it('clamps progress to 1', async () => {
      mockDownload({ uri: 'file:///apk', status: 200 });
      const onProgress = jest.fn();

      await downloadUpdate(update, onProgress);
      const callback = createDownloadResumable.mock.calls[0][3];

      callback({ totalBytesWritten: 5000, totalBytesExpectedToWrite: 1000 });
      expect(onProgress).toHaveBeenCalledWith(1);
    });

    it('reports zero progress when no total size is known', async () => {
      mockDownload({ uri: 'file:///apk', status: 200 });
      const onProgress = jest.fn();

      await downloadUpdate({ ...update, apkSize: 0 }, onProgress);
      const callback = createDownloadResumable.mock.calls[0][3];

      callback({ totalBytesWritten: 10, totalBytesExpectedToWrite: 0 });
      expect(onProgress).toHaveBeenCalledWith(0);
    });

    it('tolerates a missing progress callback', async () => {
      mockDownload({ uri: 'file:///apk', status: 200 });

      await downloadUpdate(update);
      const callback = createDownloadResumable.mock.calls[0][3];

      expect(() =>
        callback({ totalBytesWritten: 10, totalBytesExpectedToWrite: 100 })
      ).not.toThrow();
    });

    it('throws when the download resolves with nothing', async () => {
      mockDownload(null);

      await expect(downloadUpdate(update)).rejects.toThrow('Update download failed');
    });

    it('deletes the file and throws on an HTTP error body', async () => {
      mockDownload({ uri: 'file:///apk', status: 404 });

      await expect(downloadUpdate(update)).rejects.toThrow('Update download failed (HTTP 404)');
      expect(deleteAsync).toHaveBeenCalledWith('file:///apk', { idempotent: true });
    });

    it('still throws when cleaning up the error body fails', async () => {
      mockDownload({ uri: 'file:///apk', status: 500 });
      deleteAsync
        .mockResolvedValueOnce(undefined)
        .mockRejectedValueOnce(new Error('gone'));

      await expect(downloadUpdate(update)).rejects.toThrow('Update download failed (HTTP 500)');
    });
  });

  describe('installUpdate', () => {
    it('hands a content uri to the package installer', async () => {
      await installUpdate('file:///mock-cache-dir/app.apk');

      expect(getContentUriAsync).toHaveBeenCalledWith('file:///mock-cache-dir/app.apk');
      expect(startActivityAsync).toHaveBeenCalledWith(
        'android.intent.action.INSTALL_PACKAGE',
        {
          data: 'content://mock/apk',
          type: 'application/vnd.android.package-archive',
          flags: 1,
        }
      );
    });
  });
});
