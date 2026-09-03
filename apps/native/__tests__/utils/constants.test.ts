import {
  APP_VERSION,
  BUILD_VERSION,
  DOWNLOADS_DIR,
  EXTRACTED_DIR,
  PROGRESS_SYNC_DEBOUNCE_MS,
  PAGE_SIZE,
} from '../../src/utils/constants';
import appJson from '../../app.json';
import packageJson from '../../package.json';

describe('constants', () => {
  it('exports DOWNLOADS_DIR', () => {
    expect(DOWNLOADS_DIR).toBe('shelvarr-downloads');
  });

  it('exports EXTRACTED_DIR', () => {
    expect(EXTRACTED_DIR).toBe('shelvarr-extracted');
  });

  it('exports PROGRESS_SYNC_DEBOUNCE_MS', () => {
    expect(PROGRESS_SYNC_DEBOUNCE_MS).toBe(3000);
  });

  it('exports PAGE_SIZE', () => {
    expect(PAGE_SIZE).toBe(20);
  });

  describe('APP_VERSION', () => {
    it('is a string', () => {
      expect(typeof APP_VERSION).toBe('string');
    });

    it('matches the version in app.json', () => {
      expect(APP_VERSION).toBe(appJson.expo.version);
    });

    it('matches the version in package.json', () => {
      expect(APP_VERSION).toBe(packageJson.version);
    });

    it('matches semantic versioning pattern', () => {
      expect(APP_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
    });
  });

  describe('BUILD_VERSION', () => {
    it('is a string', () => {
      expect(typeof BUILD_VERSION).toBe('string');
    });

    it('is non-empty', () => {
      expect(BUILD_VERSION.length).toBeGreaterThan(0);
    });

    it('matches EXPO_PUBLIC_BUILD_VERSION when set, otherwise falls back to "dev"', () => {
      const fromEnv = process.env.EXPO_PUBLIC_BUILD_VERSION;
      if (fromEnv) {
        expect(BUILD_VERSION).toBe(fromEnv);
      } else {
        expect(BUILD_VERSION).toBe('dev');
      }
    });
  });
});
