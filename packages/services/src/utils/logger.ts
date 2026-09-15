/**
 * Simple structured logger utility
 *
 * As well as writing to the console, every line is kept in a bounded
 * in-memory ring buffer so the admin diagnostics API (and the MCP server in
 * front of it) can answer "what has this server been doing?" without anyone
 * having to shell into the container and read `docker logs`.
 *
 * Two things keep that answer honest when it matters most:
 *
 *   - `configureLogFile` also appends every line to a file, synchronously, and
 *     reads the tail of it back on the next start. A crash and the restart it
 *     causes no longer take the evidence with them.
 *   - `captureConsole` records what reaches `console.*` without going through
 *     a logger — Next.js's own errors, uncaught exceptions, and older code
 *     that never adopted `createLogger`.
 */

import {
  closeSync,
  fstatSync,
  mkdirSync,
  openSync,
  readSync,
  renameSync,
  writeSync,
} from 'node:fs';
import { dirname } from 'node:path';
import { format } from 'node:util';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  context?: string;
  data?: Record<string, unknown>;
}

/**
 * A line as it is kept in the ring buffer.
 *
 * `data` is the JSON text rather than the original object: the caller's
 * object may be mutated (or huge, or circular) after we return, and holding a
 * reference to it would make the buffer's memory use unbounded and its
 * contents a lie.
 */
export interface BufferedLogEntry {
  /**
   * Position in the stream, oldest = smallest. Carries on across restarts
   * when a log file is configured, so it only ever goes up.
   */
  sequence: number;
  timestamp: string;
  level: LogLevel;
  message: string;
  context?: string;
  data?: string;
}

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

function isLogLevel(value: unknown): value is LogLevel {
  return typeof value === 'string' && Object.hasOwn(LOG_LEVELS, value);
}

/**
 * The configured level, falling back to info for anything unrecognised.
 * Without the check a typo such as `LOG_LEVEL=verbose` compared as undefined
 * and silently muted every line.
 */
const currentLevel: LogLevel = (() => {
  const raw = process.env['LOG_LEVEL']?.trim().toLowerCase();
  return isLogLevel(raw) ? raw : 'info';
})();

function shouldLog(level: LogLevel): boolean {
  return LOG_LEVELS[level] >= LOG_LEVELS[currentLevel];
}

/** How many lines the buffer holds before the oldest start falling off. */
const DEFAULT_BUFFER_SIZE = 2000;
const MAX_BUFFER_SIZE = 50000;

function resolveBufferSize(): number {
  const raw = process.env['LOG_BUFFER_SIZE'];
  if (raw === undefined) return DEFAULT_BUFFER_SIZE;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed < 0) return DEFAULT_BUFFER_SIZE;
  return Math.min(parsed, MAX_BUFFER_SIZE);
}

/** Longest `data` blob kept per line. Enough to be useful, small enough to bound the buffer. */
const MAX_DATA_LENGTH = 2000;

/** Longest message kept per line. A stack trace fits; a dumped response body does not. */
const MAX_MESSAGE_LENGTH = 8000;

/** Rotate the log file once it would pass this size, keeping this many old ones. */
const MAX_FILE_BYTES = 5 * 1024 * 1024;
const ROTATED_FILES = 2;

/** Owner-only: logs carry file paths, search terms and email addresses. */
const FILE_MODE = 0o600;

/** How much of the end of each log file is read back on startup. */
const HISTORY_READ_BYTES = 4 * 1024 * 1024;

interface RingBuffer {
  entries: Array<BufferedLogEntry | undefined>;
  capacity: number;
  /** Where the next line is written. */
  cursor: number;
  /** How many slots are filled; stops growing at `capacity`. */
  filled: number;
  /** The next sequence number to hand out. */
  sequence: number;
  /** Lines read back from the log file, written before this process started. */
  restored: number;
  /** Whether the log file's history has been read in, so it happens once. */
  historyRestored: boolean;
}

function createBuffer(): RingBuffer {
  const capacity = resolveBufferSize();
  return {
    entries: new Array(capacity),
    capacity,
    cursor: 0,
    filled: 0,
    sequence: 0,
    restored: 0,
    historyRestored: false,
  };
}

/** An open log file, and how much has been written to it. */
interface FileSink {
  path: string;
  /** -1 once closed, so a failure mid-rotation cannot close someone else's descriptor. */
  fd: number;
  size: number;
}

type ConsoleMethod = 'debug' | 'log' | 'info' | 'warn' | 'error';
type ConsoleFn = (...args: unknown[]) => void;

/**
 * Logger state is parked on globalThis rather than in module-level consts.
 *
 * Next.js can end up with more than one copy of this module — server
 * components and route handlers are compiled separately, and dev reloads
 * discard the old one — and a per-copy buffer would mean the API showed only
 * the lines that happened to be written through its own copy. The same goes
 * for the log file, which must be opened once, and the console, which must be
 * wrapped once.
 */
const BUFFER_KEY = Symbol.for('shelvarr.logBuffer');
const FILE_KEY = Symbol.for('shelvarr.logFile');
const CONSOLE_KEY = Symbol.for('shelvarr.consoleCapture');
/** Set while a logger writes its own line to the console, so the capture skips it. */
const WRITING_KEY = Symbol.for('shelvarr.loggerWriting');

type LoggerHost = typeof globalThis & {
  [BUFFER_KEY]?: RingBuffer;
  [FILE_KEY]?: FileSink;
  [CONSOLE_KEY]?: Partial<Record<ConsoleMethod, ConsoleFn>>;
  [WRITING_KEY]?: boolean;
};

const host = globalThis as LoggerHost;

function getBuffer(): RingBuffer {
  const existing = host[BUFFER_KEY];
  if (existing) return existing;
  const created = createBuffer();
  host[BUFFER_KEY] = created;
  return created;
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** JSON, or a marker, for values that will not serialise (circular refs, BigInt). */
function safeStringify(data: Record<string, unknown>): string | undefined {
  let text: string;
  try {
    text = JSON.stringify(data) ?? '';
  } catch {
    return '[unserialisable]';
  }
  if (!text || text === '{}') return undefined;
  return text.length > MAX_DATA_LENGTH ? `${text.slice(0, MAX_DATA_LENGTH)}…[truncated]` : text;
}

function capMessage(message: string): string {
  return message.length > MAX_MESSAGE_LENGTH
    ? `${message.slice(0, MAX_MESSAGE_LENGTH)}…[truncated]`
    : message;
}

function push(buffer: RingBuffer, entry: BufferedLogEntry): void {
  if (buffer.capacity === 0) return;
  buffer.entries[buffer.cursor] = entry;
  buffer.cursor = (buffer.cursor + 1) % buffer.capacity;
  if (buffer.filled < buffer.capacity) buffer.filled++;
}

function record(entry: LogEntry, dataText: string | undefined): void {
  const buffer = getBuffer();

  const buffered: BufferedLogEntry = {
    sequence: buffer.sequence++,
    timestamp: entry.timestamp,
    level: entry.level,
    message: capMessage(entry.message),
    ...(entry.context ? { context: entry.context } : {}),
    ...(dataText ? { data: dataText } : {}),
  };

  push(buffer, buffered);
  appendToFile(buffered);
}

/** Every buffered line, oldest first. */
export function readLogBuffer(): BufferedLogEntry[] {
  const buffer = getBuffer();
  const out: BufferedLogEntry[] = [];
  // Oldest line sits `filled` slots behind the cursor, wrapping around.
  const start = (buffer.cursor - buffer.filled + buffer.capacity) % buffer.capacity;
  for (let index = 0; index < buffer.filled; index++) {
    const entry = buffer.entries[(start + index) % buffer.capacity];
    if (entry) out.push(entry);
  }
  return out;
}

export interface LogBufferStats {
  /** Lines currently held. */
  buffered: number;
  /** Lines the buffer can hold before evicting. */
  capacity: number;
  /** Lines ever recorded, evicted ones and earlier runs' included. */
  recorded: number;
  /** How many of the buffered lines were read back from the log file at startup. */
  restored: number;
  /** The file every line is also written to, or null when logging to memory only. */
  file: string | null;
  /** The level below which nothing is logged, and so nothing is buffered. */
  level: LogLevel;
}

export function getLogBufferStats(): LogBufferStats {
  const buffer = getBuffer();
  return {
    buffered: buffer.filled,
    capacity: buffer.capacity,
    recorded: buffer.sequence,
    restored: buffer.restored,
    file: host[FILE_KEY]?.path ?? null,
    level: currentLevel,
  };
}

/** Empty the buffer. Used by tests, which must not see each other's lines. */
export function clearLogBuffer(): void {
  host[BUFFER_KEY] = createBuffer();
}

/**
 * Append every line to `path` as JSON, and bring back the tail of what an
 * earlier process wrote there.
 *
 * Writes are synchronous on purpose: the lines that matter most are the ones
 * just before a crash, and a buffered write would still be sitting in memory
 * when the process died. The file rotates at MAX_FILE_BYTES, keeping
 * ROTATED_FILES old ones beside it.
 *
 * Meant to be called once at startup; calling it again with the same path is
 * a no-op. Never throws: if the file cannot be used the logger carries on in
 * memory and records why.
 */
export function configureLogFile(path: string): void {
  if (host[FILE_KEY]?.path === path) return;
  closeLogFile();

  let sink: FileSink;
  try {
    mkdirSync(dirname(path), { recursive: true });
    restoreHistory(readHistory(path, getBuffer().capacity));
    const cutShort = !endsWithNewline(path);
    const fd = openSync(path, 'a', FILE_MODE);
    sink = { path, fd, size: fstatSync(fd).size };
    // A line cut short by a crash would otherwise swallow the first new one.
    if (cutShort) sink.size += writeSync(fd, '\n');
  } catch (error) {
    log('error', `Could not write logs to ${path}: ${describeError(error)}`, 'logger');
    return;
  }
  host[FILE_KEY] = sink;

  // Lines logged before now exist only in memory. Put them on disk too.
  for (const entry of readLogBuffer().slice(getBuffer().restored)) appendToFile(entry);
}

/** Stop writing to the log file. Harmless when none is open. */
export function closeLogFile(): void {
  const sink = host[FILE_KEY];
  if (!sink) return;
  delete host[FILE_KEY];
  closeQuietly(sink);
}

function closeQuietly(sink: FileSink): void {
  if (sink.fd < 0) return;
  try {
    closeSync(sink.fd);
  } catch {
    // Already gone; nothing more to do.
  }
  sink.fd = -1;
}

function appendToFile(entry: BufferedLogEntry): void {
  const sink = host[FILE_KEY];
  if (!sink) return;

  const line = `${JSON.stringify(entry)}\n`;
  try {
    const bytes = Buffer.byteLength(line);
    if (sink.size > 0 && sink.size + bytes > MAX_FILE_BYTES) rotate(sink);
    writeSync(sink.fd, line);
    sink.size += bytes;
  } catch (error) {
    // A full disk or a vanished volume must not take logging down with it.
    delete host[FILE_KEY];
    closeQuietly(sink);
    log('error', `Stopped writing logs to ${sink.path}: ${describeError(error)}`, 'logger');
  }
}

/** shelvarr.log → shelvarr.log.1 → shelvarr.log.2, dropping the oldest. */
function rotate(sink: FileSink): void {
  closeQuietly(sink);
  for (let index = ROTATED_FILES; index > 1; index--) {
    renameIfPresent(`${sink.path}.${index - 1}`, `${sink.path}.${index}`);
  }
  renameIfPresent(sink.path, `${sink.path}.1`);
  sink.fd = openSync(sink.path, 'a', FILE_MODE);
  sink.size = 0;
}

function renameIfPresent(from: string, to: string): void {
  try {
    renameSync(from, to);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
}

/** Whether a file ends in a newline. A missing or empty file counts as ending cleanly. */
function endsWithNewline(path: string): boolean {
  let fd: number;
  try {
    fd = openSync(path, 'r');
  } catch {
    return true;
  }
  try {
    const size = fstatSync(fd).size;
    if (size === 0) return true;
    const last = Buffer.alloc(1);
    readSync(fd, last, 0, 1, size - 1);
    return last[0] === 0x0a;
  } finally {
    closeSync(fd);
  }
}

/** The last `maxBytes` of a file split into lines, or nothing if it is not there. */
function readTailLines(path: string, maxBytes: number): string[] {
  let fd: number;
  try {
    fd = openSync(path, 'r');
  } catch {
    return [];
  }
  try {
    const size = fstatSync(fd).size;
    const length = Math.min(size, maxBytes);
    const chunk = Buffer.alloc(length);
    readSync(fd, chunk, 0, length, size - length);
    const lines = chunk.toString('utf8').split('\n');
    // Starting mid-file means the first line is probably cut in half.
    if (length < size) lines.shift();
    return lines;
  } finally {
    closeSync(fd);
  }
}

/** Parse log-file lines, skipping anything that is not one of ours. */
function parseLogLines(lines: string[]): BufferedLogEntry[] {
  const out: BufferedLogEntry[] = [];
  for (const line of lines) {
    if (!line) continue;
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(line);
    } catch {
      // A line cut short by a crash mid-write.
      continue;
    }
    if (
      typeof parsed?.['sequence'] !== 'number' ||
      typeof parsed['timestamp'] !== 'string' ||
      typeof parsed['message'] !== 'string' ||
      !isLogLevel(parsed['level'])
    ) {
      continue;
    }
    out.push({
      sequence: parsed['sequence'],
      timestamp: parsed['timestamp'],
      level: parsed['level'],
      message: parsed['message'],
      ...(typeof parsed['context'] === 'string' ? { context: parsed['context'] } : {}),
      ...(typeof parsed['data'] === 'string' ? { data: parsed['data'] } : {}),
    });
  }
  return out;
}

/** The last `limit` lines an earlier process wrote, reaching into the rotated file if need be. */
function readHistory(path: string, limit: number): BufferedLogEntry[] {
  if (limit === 0) return [];
  let entries = parseLogLines(readTailLines(path, HISTORY_READ_BYTES));
  if (entries.length < limit) {
    entries = [...parseLogLines(readTailLines(`${path}.1`, HISTORY_READ_BYTES)), ...entries];
  }
  return entries.slice(-limit);
}

/**
 * Put an earlier process's lines in front of the ones this process has
 * already logged, and carry the sequence numbers on from where it stopped, so
 * a client polling with `afterSequence` does not mistake new lines for old.
 */
function restoreHistory(history: BufferedLogEntry[]): void {
  const buffer = getBuffer();
  if (buffer.historyRestored) return;
  buffer.historyRestored = true;
  if (history.length === 0) return;

  const live = readLogBuffer();
  let next = history.reduce((max, entry) => Math.max(max, entry.sequence), -1) + 1;
  const renumbered = live.map((entry) => ({ ...entry, sequence: next++ }));

  const room = buffer.capacity - renumbered.length;
  const kept = room > 0 ? history.slice(-room) : [];

  const rebuilt = createBuffer();
  rebuilt.historyRestored = true;
  for (const entry of [...kept, ...renumbered]) push(rebuilt, entry);
  rebuilt.sequence = next;
  rebuilt.restored = kept.length;
  host[BUFFER_KEY] = rebuilt;
}

const CONSOLE_LEVELS: Record<ConsoleMethod, LogLevel> = {
  debug: 'debug',
  log: 'info',
  info: 'info',
  warn: 'warn',
  error: 'error',
};

/** Colour codes Next.js puts in its output: noise in a buffer that is read as text. */
// eslint-disable-next-line no-control-regex
const ANSI_ESCAPE = /\u001b\[[0-9;]*m/g;

/**
 * Record whatever reaches the console without passing through a logger.
 *
 * Next.js reports a failed render or a throwing route handler with
 * `console.error`, and plenty of older code here does the same; none of that
 * reached the buffer before. Captured lines carry the "console" context.
 * Idempotent, and lines a logger is writing are left to the logger.
 */
export function captureConsole(): void {
  if (host[CONSOLE_KEY]) return;

  const originals: Partial<Record<ConsoleMethod, ConsoleFn>> = {};
  for (const method of Object.keys(CONSOLE_LEVELS) as ConsoleMethod[]) {
    const original = console[method] as ConsoleFn;
    const level = CONSOLE_LEVELS[method];
    originals[method] = original;

    console[method] = (...args: unknown[]) => {
      if (!host[WRITING_KEY] && shouldLog(level)) {
        try {
          const message = format(...args).replace(ANSI_ESCAPE, '').trimEnd();
          if (message) {
            record({ timestamp: new Date().toISOString(), level, message, context: 'console' }, undefined);
          }
        } catch {
          // Recording is best effort. The console line below must still happen.
        }
      }
      original.apply(console, args);
    };
  }
  host[CONSOLE_KEY] = originals;
}

/** Put the console back the way `captureConsole` found it. Used by tests. */
export function releaseConsole(): void {
  const originals = host[CONSOLE_KEY];
  if (!originals) return;
  for (const [method, original] of Object.entries(originals)) {
    console[method as ConsoleMethod] = original;
  }
  delete host[CONSOLE_KEY];
}

function formatLog(entry: LogEntry, dataText: string | undefined): string {
  const parts = [
    entry.timestamp,
    `[${entry.level.toUpperCase()}]`,
    entry.context ? `[${entry.context}]` : '',
    entry.message,
  ].filter(Boolean);

  let output = parts.join(' ');

  if (dataText) {
    output += ` ${dataText}`;
  }

  return output;
}

function log(level: LogLevel, message: string, context?: string, data?: Record<string, unknown>): void {
  if (!shouldLog(level)) return;

  const entry: LogEntry = {
    timestamp: new Date().toISOString(),
    level,
    message,
    context,
    data,
  };

  // Serialised once, then shared by the console line and the buffered copy.
  const dataText = data && Object.keys(data).length > 0 ? safeStringify(data) : undefined;

  record(entry, dataText);

  const output = formatLog(entry, dataText);

  // Already recorded above, so the console capture must not record it again.
  const wasWriting = host[WRITING_KEY];
  host[WRITING_KEY] = true;
  try {
    if (level === 'error') {
      console.error(output);
    } else if (level === 'warn') {
      console.warn(output);
    } else {
      console.log(output);
    }
  } finally {
    host[WRITING_KEY] = wasWriting;
  }
}

export function createLogger(context: string) {
  return {
    debug: (message: string, data?: Record<string, unknown>) => log('debug', message, context, data),
    info: (message: string, data?: Record<string, unknown>) => log('info', message, context, data),
    warn: (message: string, data?: Record<string, unknown>) => log('warn', message, context, data),
    error: (message: string, data?: Record<string, unknown>) => log('error', message, context, data),
  };
}

export const logger = {
  debug: (message: string, data?: Record<string, unknown>) => log('debug', message, undefined, data),
  info: (message: string, data?: Record<string, unknown>) => log('info', message, undefined, data),
  warn: (message: string, data?: Record<string, unknown>) => log('warn', message, undefined, data),
  error: (message: string, data?: Record<string, unknown>) => log('error', message, undefined, data),
};

export default logger;
