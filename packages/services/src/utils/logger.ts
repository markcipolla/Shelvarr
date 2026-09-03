/**
 * Simple structured logger utility
 *
 * As well as writing to the console, every line is kept in a bounded
 * in-memory ring buffer so the admin diagnostics API (and the MCP server in
 * front of it) can answer "what has this server been doing?" without anyone
 * having to shell into the container and read `docker logs`.
 */

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
  /** Position in the stream since the process started, oldest = smallest. */
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

const currentLevel: LogLevel = (process.env['LOG_LEVEL'] as LogLevel) || 'info';

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

interface RingBuffer {
  entries: Array<BufferedLogEntry | undefined>;
  capacity: number;
  /** Where the next line is written. */
  cursor: number;
  /** How many slots are filled; stops growing at `capacity`. */
  filled: number;
  /** Lines recorded since the process started, including ones long evicted. */
  sequence: number;
}

function createBuffer(): RingBuffer {
  const capacity = resolveBufferSize();
  return { entries: new Array(capacity), capacity, cursor: 0, filled: 0, sequence: 0 };
}

/**
 * Parked on globalThis rather than in a module-level `const`.
 *
 * Next.js can end up with more than one copy of this module — server
 * components and route handlers are compiled separately, and dev reloads
 * discard the old one — and a per-copy buffer would mean the API showed only
 * the lines that happened to be written through its own copy.
 */
const BUFFER_KEY = Symbol.for('shelvarr.logBuffer');

type BufferHost = typeof globalThis & { [BUFFER_KEY]?: RingBuffer };

function getBuffer(): RingBuffer {
  const host = globalThis as BufferHost;
  const existing = host[BUFFER_KEY];
  if (existing) return existing;
  const created = createBuffer();
  host[BUFFER_KEY] = created;
  return created;
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

function record(entry: LogEntry, dataText: string | undefined): void {
  const buffer = getBuffer();
  if (buffer.capacity === 0) return;

  const buffered: BufferedLogEntry = {
    sequence: buffer.sequence++,
    timestamp: entry.timestamp,
    level: entry.level,
    message: entry.message,
    ...(entry.context ? { context: entry.context } : {}),
    ...(dataText ? { data: dataText } : {}),
  };

  buffer.entries[buffer.cursor] = buffered;
  buffer.cursor = (buffer.cursor + 1) % buffer.capacity;
  if (buffer.filled < buffer.capacity) buffer.filled++;
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
  /** Lines recorded since the process started, evicted ones included. */
  recorded: number;
  /** The level below which nothing is logged, and so nothing is buffered. */
  level: LogLevel;
}

export function getLogBufferStats(): LogBufferStats {
  const buffer = getBuffer();
  return {
    buffered: buffer.filled,
    capacity: buffer.capacity,
    recorded: buffer.sequence,
    level: currentLevel,
  };
}

/** Empty the buffer. Used by tests, which must not see each other's lines. */
export function clearLogBuffer(): void {
  const host = globalThis as BufferHost;
  host[BUFFER_KEY] = createBuffer();
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

  if (level === 'error') {
    console.error(output);
  } else if (level === 'warn') {
    console.warn(output);
  } else {
    console.log(output);
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
