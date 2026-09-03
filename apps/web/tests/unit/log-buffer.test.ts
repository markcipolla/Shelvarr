/**
 * The in-memory log ring buffer, and the filtering the diagnostics API puts
 * in front of it.
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';

import {
  clearLogBuffer,
  createLogger,
  getLogBufferStats,
  readLogBuffer,
} from '../../lib/utils/logger.js';
import { searchLogs } from '@shelvarr/services/admin/diagnostics';

describe('log buffer', () => {
  let originalLog: typeof console.log;
  let originalWarn: typeof console.warn;
  let originalError: typeof console.error;

  beforeEach(() => {
    // The buffer is shared, so a stray line from another test would show up.
    clearLogBuffer();

    originalLog = console.log;
    originalWarn = console.warn;
    originalError = console.error;
    console.log = () => {};
    console.warn = () => {};
    console.error = () => {};
  });

  afterEach(() => {
    console.log = originalLog;
    console.warn = originalWarn;
    console.error = originalError;
    clearLogBuffer();
  });

  it('records every logged line, oldest first', () => {
    const log = createLogger('scan');
    log.info('one');
    log.warn('two');
    log.error('three');

    const entries = readLogBuffer();
    assert.deepStrictEqual(
      entries.map((entry) => entry.message),
      ['one', 'two', 'three']
    );
    assert.deepStrictEqual(
      entries.map((entry) => entry.level),
      ['info', 'warn', 'error']
    );
    assert.ok(entries.every((entry) => entry.context === 'scan'));
  });

  it('numbers lines so a caller can poll for what is new', () => {
    const log = createLogger('queue');
    log.info('first');
    log.info('second');

    const [first, second] = readLogBuffer();
    assert.strictEqual(first.sequence, 0);
    assert.strictEqual(second.sequence, 1);

    const fresh = searchLogs({ afterSequence: first.sequence });
    assert.deepStrictEqual(
      fresh.entries.map((entry) => entry.message),
      ['second']
    );
  });

  it('keeps data as JSON text rather than a reference to the caller object', () => {
    const log = createLogger('scan');
    const payload: Record<string, unknown> = { files: 3 };
    log.info('scanned', payload);

    // Mutating afterwards must not rewrite history.
    payload['files'] = 999;

    assert.strictEqual(readLogBuffer()[0].data, '{"files":3}');
  });

  it('survives data that will not serialise', () => {
    const log = createLogger('scan');
    const circular: Record<string, unknown> = {};
    circular['self'] = circular;

    log.info('circular', circular);

    assert.strictEqual(readLogBuffer()[0].data, '[unserialisable]');
  });

  it('drops the oldest lines once full, and says how many it has seen', async () => {
    // The capacity is read from the environment when the buffer is created.
    const previous = process.env['LOG_BUFFER_SIZE'];
    process.env['LOG_BUFFER_SIZE'] = '3';
    clearLogBuffer();

    try {
      const log = createLogger('scan');
      for (let index = 0; index < 5; index++) log.info(`line ${index}`);

      assert.deepStrictEqual(
        readLogBuffer().map((entry) => entry.message),
        ['line 2', 'line 3', 'line 4']
      );

      const stats = getLogBufferStats();
      assert.strictEqual(stats.buffered, 3);
      assert.strictEqual(stats.capacity, 3);
      assert.strictEqual(stats.recorded, 5);
    } finally {
      if (previous === undefined) delete process.env['LOG_BUFFER_SIZE'];
      else process.env['LOG_BUFFER_SIZE'] = previous;
      clearLogBuffer();
    }
  });

  it('still logs to the console', () => {
    const lines: string[] = [];
    console.log = (...args: unknown[]) => {
      lines.push(args.join(' '));
    };

    createLogger('scan').info('visible', { count: 1 });

    assert.strictEqual(lines.length, 1);
    assert.ok(lines[0].includes('[INFO]'));
    assert.ok(lines[0].includes('[scan]'));
    assert.ok(lines[0].includes('{"count":1}'));
  });
});

describe('searchLogs', () => {
  beforeEach(() => {
    clearLogBuffer();
    console.log = () => {};
    console.warn = () => {};
    console.error = () => {};

    const scanner = createLogger('scanner');
    const scheduler = createLogger('scheduler');
    scanner.info('scan started');
    scanner.warn('skipped a file', { path: '/books/odd.epub' });
    scheduler.info('scheduler tick');
    scheduler.error('job blew up', { name: 'comic_update_all' });
  });

  it('filters by minimum level', () => {
    const result = searchLogs({ minLevel: 'warn' });
    assert.deepStrictEqual(
      result.entries.map((entry) => entry.message),
      ['skipped a file', 'job blew up']
    );
    assert.strictEqual(result.matched, 2);
  });

  it('filters by logger context, case-insensitively', () => {
    const result = searchLogs({ context: 'SCHEDUL' });
    assert.deepStrictEqual(
      result.entries.map((entry) => entry.message),
      ['scheduler tick', 'job blew up']
    );
  });

  it('searches the message and its data', () => {
    assert.deepStrictEqual(
      searchLogs({ search: 'odd.epub' }).entries.map((entry) => entry.message),
      ['skipped a file']
    );
    assert.deepStrictEqual(
      searchLogs({ search: 'BLEW' }).entries.map((entry) => entry.message),
      ['job blew up']
    );
  });

  it('returns the most recent matches, still oldest first', () => {
    const result = searchLogs({ limit: 2 });
    assert.deepStrictEqual(
      result.entries.map((entry) => entry.message),
      ['scheduler tick', 'job blew up']
    );
    // `matched` counts before the limit, so a caller knows there is more.
    assert.strictEqual(result.matched, 4);
  });

  it('excludes lines older than `since`', () => {
    const future = new Date(Date.now() + 60_000).toISOString();
    assert.strictEqual(searchLogs({ since: future }).entries.length, 0);

    const past = new Date(Date.now() - 60_000).toISOString();
    assert.strictEqual(searchLogs({ since: past }).entries.length, 4);
  });

  it('clamps an absurd limit rather than trusting it', () => {
    assert.strictEqual(searchLogs({ limit: 10_000_000 }).entries.length, 4);
    assert.strictEqual(searchLogs({ limit: -5 }).entries.length, 1);
  });
});
