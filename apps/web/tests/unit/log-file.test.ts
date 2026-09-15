/**
 * What keeps the diagnostics log honest across restarts and outside the
 * logger: the log file it is written to and read back from, and the capture
 * of everything else that reaches the console.
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  captureConsole,
  clearLogBuffer,
  closeLogFile,
  configureLogFile,
  createLogger,
  getLogBufferStats,
  readLogBuffer,
  releaseConsole,
} from '../../lib/utils/logger.js';

type ConsoleMethod = 'debug' | 'log' | 'info' | 'warn' | 'error';
const METHODS: ConsoleMethod[] = ['debug', 'log', 'info', 'warn', 'error'];

/** Swap the console for collectors, returning what was printed and a way to put it back. */
function muteConsole() {
  const printed: Array<{ method: ConsoleMethod; args: unknown[] }> = [];
  const originals = Object.fromEntries(METHODS.map((method) => [method, console[method]]));
  for (const method of METHODS) {
    console[method] = (...args: unknown[]) => {
      printed.push({ method, args });
    };
  }
  return {
    printed,
    restore: () => {
      for (const method of METHODS) console[method] = originals[method]!;
    },
  };
}

/** A line as an earlier process would have written it. */
function earlierLine(sequence: number, message = `old ${sequence}`): string {
  return `${JSON.stringify({
    sequence,
    timestamp: '2026-09-01T00:00:00.000Z',
    level: 'info',
    message,
    context: 'earlier',
  })}\n`;
}

function fileEntries(path: string): Array<Record<string, unknown>> {
  return readFileSync(path, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

describe('log file', () => {
  let dir: string;
  let path: string;
  let quiet: ReturnType<typeof muteConsole>;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'shelvarr-log-'));
    path = join(dir, 'logs', 'shelvarr.log');
    clearLogBuffer();
    quiet = muteConsole();
  });

  afterEach(() => {
    closeLogFile();
    clearLogBuffer();
    quiet.restore();
    rmSync(dir, { recursive: true, force: true });
  });

  it('writes every line to the file as JSON', () => {
    configureLogFile(path);
    createLogger('scan').warn('on disk', { count: 1 });

    const last = fileEntries(path).at(-1);
    assert.strictEqual(last?.['message'], 'on disk');
    assert.strictEqual(last?.['level'], 'warn');
    assert.strictEqual(last?.['context'], 'scan');
    assert.strictEqual(last?.['data'], '{"count":1}');
    assert.strictEqual(getLogBufferStats().file, path);
    // Logs carry paths and email addresses, so nobody else on the host reads them.
    assert.strictEqual(statSync(path).mode & 0o777, 0o600);
  });

  it('brings back what an earlier process wrote, and carries the numbering on', () => {
    mkdirSync(join(dir, 'logs'));
    writeFileSync(path, earlierLine(10) + earlierLine(11) + earlierLine(12));

    createLogger('boot').info('before the file was opened');
    configureLogFile(path);
    createLogger('boot').info('after');

    const entries = readLogBuffer();
    assert.deepStrictEqual(
      entries.map((entry) => entry.message),
      ['old 10', 'old 11', 'old 12', 'before the file was opened', 'after']
    );
    assert.deepStrictEqual(
      entries.map((entry) => entry.sequence),
      [10, 11, 12, 13, 14]
    );
    assert.strictEqual(getLogBufferStats().restored, 3);

    // The line logged before the file was open made it to disk as well.
    assert.deepStrictEqual(
      fileEntries(path).map((entry) => entry['message']),
      ['old 10', 'old 11', 'old 12', 'before the file was opened', 'after']
    );
  });

  it('survives a line cut short by a crash, without losing the next one', () => {
    mkdirSync(join(dir, 'logs'));
    writeFileSync(path, earlierLine(0, 'intact'));
    appendFileSync(path, '{"sequence":1,"timest');

    configureLogFile(path);
    createLogger('boot').info('fresh');

    assert.deepStrictEqual(
      readLogBuffer().map((entry) => entry.message),
      ['intact', 'fresh']
    );
    const lines = readFileSync(path, 'utf8').split('\n').filter(Boolean);
    assert.strictEqual(JSON.parse(lines.at(-1)!).message, 'fresh');
  });

  it('reaches into the rotated file when the current one is short', () => {
    mkdirSync(join(dir, 'logs'));
    writeFileSync(`${path}.1`, earlierLine(0) + earlierLine(1) + earlierLine(2));
    writeFileSync(path, earlierLine(3));

    configureLogFile(path);

    assert.deepStrictEqual(
      readLogBuffer().map((entry) => entry.message),
      ['old 0', 'old 1', 'old 2', 'old 3']
    );
  });

  it('rotates once the file passes its size limit', () => {
    configureLogFile(path);
    const log = createLogger('bulk');
    const big = 'x'.repeat(8000);
    for (let index = 0; index < 700; index++) log.info(big);

    assert.ok(existsSync(`${path}.1`), 'expected a rotated file');
    assert.ok(statSync(path).size < 5 * 1024 * 1024);
    // Still writing to the fresh file.
    log.info('after rotation');
    assert.strictEqual(fileEntries(path).at(-1)?.['message'], 'after rotation');
  });

  it('keeps logging in memory, and says why, when the file cannot be opened', () => {
    // A regular file where a directory should be, so mkdir fails.
    writeFileSync(join(dir, 'blocker'), '');
    const unusable = join(dir, 'blocker', 'logs', 'shelvarr.log');

    configureLogFile(unusable);
    createLogger('scan').info('still here');

    const messages = readLogBuffer().map((entry) => `${entry.context}: ${entry.message}`);
    assert.ok(messages.some((line) => line.startsWith(`logger: Could not write logs to ${unusable}`)));
    assert.ok(messages.includes('scan: still here'));
    assert.strictEqual(getLogBufferStats().file, null);
  });

  it('opening the same file twice writes each line once', () => {
    configureLogFile(path);
    configureLogFile(path);
    createLogger('scan').info('once');

    assert.strictEqual(fileEntries(path).filter((entry) => entry['message'] === 'once').length, 1);
  });
});

describe('console capture', () => {
  let quiet: ReturnType<typeof muteConsole>;

  beforeEach(() => {
    clearLogBuffer();
    quiet = muteConsole();
    captureConsole();
  });

  afterEach(() => {
    releaseConsole();
    quiet.restore();
    clearLogBuffer();
  });

  it('records console output that never went through a logger', () => {
    console.error('Route failed:', new Error('kaboom'));

    const entry = readLogBuffer().at(-1);
    assert.strictEqual(entry?.level, 'error');
    assert.strictEqual(entry?.context, 'console');
    assert.match(entry?.message ?? '', /^Route failed: Error: kaboom/);
    // The stack comes along, which is most of the point.
    assert.match(entry?.message ?? '', /\n\s+at /);
  });

  it('still prints what it records', () => {
    console.warn('heads up');

    assert.deepStrictEqual(quiet.printed.at(-1), { method: 'warn', args: ['heads up'] });
  });

  it('records a logger line once, not twice', () => {
    createLogger('scan').warn('only once');

    assert.strictEqual(
      readLogBuffer().filter((entry) => entry.message.includes('only once')).length,
      1
    );
    assert.strictEqual(readLogBuffer().at(-1)?.context, 'scan');
    assert.strictEqual(quiet.printed.length, 1);
  });

  it('strips terminal colour codes', () => {
    console.log('\u001b[31m⨯\u001b[39m Error: boom');

    assert.strictEqual(readLogBuffer().at(-1)?.message, '⨯ Error: boom');
  });

  it('leaves out levels below the configured one', { skip: getLogBufferStats().level === 'debug' }, () => {
    console.debug('noisy');

    assert.strictEqual(readLogBuffer().length, 0);
  });

  it('wraps the console once however often it is asked', () => {
    captureConsole();
    console.log('just the one');

    assert.strictEqual(readLogBuffer().length, 1);
    assert.strictEqual(quiet.printed.length, 1);
  });

  it('puts the console back as it found it', () => {
    releaseConsole();
    console.log('not recorded');

    assert.strictEqual(readLogBuffer().length, 0);
    assert.strictEqual(quiet.printed.at(-1)?.args[0], 'not recorded');
  });
});
