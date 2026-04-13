import { describe, it } from 'node:test';
import assert from 'node:assert';
import { APP_VERSION, APP_NAME, APP_DESCRIPTION } from '../../lib/constants.js';

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
});
