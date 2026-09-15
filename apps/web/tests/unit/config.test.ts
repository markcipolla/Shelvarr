import { describe, it } from 'node:test';
import assert from 'node:assert';
import config from '../../lib/config/index.js';

describe('Config', () => {
  it('should have default values', () => {
    assert.strictEqual(typeof config.libraryRoot, 'string');
    assert.ok(Array.isArray(config.supportedExtensions));
    assert.ok(config.supportedExtensions.includes('.epub'));
    assert.ok(config.supportedExtensions.includes('.pdf'));
  });

  it('should have supported extensions', () => {
    const expected = ['.epub', '.pdf', '.mobi', '.azw', '.azw3'];
    for (const ext of expected) {
      assert.ok(
        config.supportedExtensions.includes(ext),
        `Expected ${ext} to be in supported extensions`
      );
    }
  });

  it('should have a database path', () => {
    assert.ok(typeof config.dbPath === 'string');
  });

  it('should have a data directory', () => {
    assert.ok(config.dataDir);
    assert.strictEqual(typeof config.dataDir, 'string');
  });

  it('carries no API keys', () => {
    // Keys are entered in Settings, not read from the environment.
    assert.ok(!('hardcoverToken' in config));
  });
});
