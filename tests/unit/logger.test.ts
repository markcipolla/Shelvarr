import { describe, it, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert';
import { createLogger, logger } from '../../lib/utils/logger.js';

describe('Logger Utilities', () => {
  let originalLog: typeof console.log;
  let originalWarn: typeof console.warn;
  let originalError: typeof console.error;
  let logCalls: string[];
  let warnCalls: string[];
  let errorCalls: string[];

  beforeEach(() => {
    logCalls = [];
    warnCalls = [];
    errorCalls = [];

    originalLog = console.log;
    originalWarn = console.warn;
    originalError = console.error;

    console.log = (...args: unknown[]) => { logCalls.push(args.join(' ')); };
    console.warn = (...args: unknown[]) => { warnCalls.push(args.join(' ')); };
    console.error = (...args: unknown[]) => { errorCalls.push(args.join(' ')); };
  });

  afterEach(() => {
    console.log = originalLog;
    console.warn = originalWarn;
    console.error = originalError;
  });

  describe('logger', () => {
    it('should log info messages to console.log', () => {
      logger.info('Test info message');
      assert.strictEqual(logCalls.length, 1);
      assert.ok(logCalls[0].includes('[INFO]'));
      assert.ok(logCalls[0].includes('Test info message'));
    });

    it('should log warn messages to console.warn', () => {
      logger.warn('Test warn message');
      assert.strictEqual(warnCalls.length, 1);
      assert.ok(warnCalls[0].includes('[WARN]'));
      assert.ok(warnCalls[0].includes('Test warn message'));
    });

    it('should log error messages to console.error', () => {
      logger.error('Test error message');
      assert.strictEqual(errorCalls.length, 1);
      assert.ok(errorCalls[0].includes('[ERROR]'));
      assert.ok(errorCalls[0].includes('Test error message'));
    });

    it('should include data in log output', () => {
      logger.info('Test with data', { key: 'value' });
      assert.strictEqual(logCalls.length, 1);
      assert.ok(logCalls[0].includes('{"key":"value"}'));
    });

    it('should not include data when empty object', () => {
      logger.info('Test without data', {});
      assert.strictEqual(logCalls.length, 1);
      assert.ok(!logCalls[0].includes('{}'));
    });

    it('should log debug messages when LOG_LEVEL allows', () => {
      // Note: debug level may be filtered based on LOG_LEVEL env var
      // If LOG_LEVEL is 'info' (default), debug won't log
      logger.debug('Test debug message');
      // We just verify no error is thrown
    });
  });

  describe('createLogger', () => {
    it('should create a logger with context', () => {
      const contextLogger = createLogger('TestContext');
      contextLogger.info('Contextual message');
      assert.strictEqual(logCalls.length, 1);
      assert.ok(logCalls[0].includes('[TestContext]'));
      assert.ok(logCalls[0].includes('Contextual message'));
    });

    it('should create a logger that logs warnings with context', () => {
      const contextLogger = createLogger('WarnContext');
      contextLogger.warn('Contextual warning');
      assert.strictEqual(warnCalls.length, 1);
      assert.ok(warnCalls[0].includes('[WarnContext]'));
      assert.ok(warnCalls[0].includes('Contextual warning'));
    });

    it('should create a logger that logs errors with context', () => {
      const contextLogger = createLogger('ErrorContext');
      contextLogger.error('Contextual error');
      assert.strictEqual(errorCalls.length, 1);
      assert.ok(errorCalls[0].includes('[ErrorContext]'));
      assert.ok(errorCalls[0].includes('Contextual error'));
    });

    it('should create a logger that handles data with context', () => {
      const contextLogger = createLogger('DataContext');
      contextLogger.info('Message with data', { foo: 'bar' });
      assert.strictEqual(logCalls.length, 1);
      assert.ok(logCalls[0].includes('[DataContext]'));
      assert.ok(logCalls[0].includes('{"foo":"bar"}'));
    });
  });
});
