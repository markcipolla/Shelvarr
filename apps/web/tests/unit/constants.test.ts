import { describe, it } from 'node:test';
import assert from 'node:assert';
import { APP_VERSION, APP_NAME, APP_DESCRIPTION, BUILD_VERSION } from '../../lib/constants.js';

describe('Application Constants', () => {
  describe('APP_VERSION', () => {
    it('should be defined', () => {
      assert.ok(APP_VERSION);
    });

    it('should be a string', () => {
      assert.strictEqual(typeof APP_VERSION, 'string');
    });

    it('should match semantic versioning pattern', () => {
      const semverPattern = /^\d+\.\d+\.\d+$/;
      assert.ok(semverPattern.test(APP_VERSION), `Version ${APP_VERSION} should match semver pattern`);
    });
  });

  describe('APP_NAME', () => {
    it('should be defined', () => {
      assert.ok(APP_NAME);
    });

    it('should be a string', () => {
      assert.strictEqual(typeof APP_NAME, 'string');
    });

    it('should be "Shelvarr"', () => {
      assert.strictEqual(APP_NAME, 'Shelvarr');
    });
  });

  describe('APP_DESCRIPTION', () => {
    it('should be defined', () => {
      assert.ok(APP_DESCRIPTION);
    });

    it('should be a string', () => {
      assert.strictEqual(typeof APP_DESCRIPTION, 'string');
    });

    it('should contain "Book" or "Comic"', () => {
      const hasBookOrComic = APP_DESCRIPTION.includes('Book') || APP_DESCRIPTION.includes('Comic');
      assert.ok(hasBookOrComic, 'Description should mention Book or Comic');
    });
  });

  describe('BUILD_VERSION', () => {
    it('should be defined', () => {
      assert.ok(BUILD_VERSION);
    });

    it('should be a string', () => {
      assert.strictEqual(typeof BUILD_VERSION, 'string');
    });

    it('should be non-empty', () => {
      assert.ok(BUILD_VERSION.length > 0);
    });

    it('should fall back to "dev" when NEXT_PUBLIC_BUILD_VERSION is not set', () => {
      // In Node test runs without Next.js env injection, BUILD_VERSION
      // should either be a real injected value or fall back to 'dev'.
      const fromEnv = process.env.NEXT_PUBLIC_BUILD_VERSION;
      if (!fromEnv) {
        assert.strictEqual(BUILD_VERSION, 'dev');
      } else {
        assert.strictEqual(BUILD_VERSION, fromEnv);
      }
    });
  });
});
