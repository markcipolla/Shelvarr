/**
 * Simple structured logger utility
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  context?: string;
  data?: Record<string, unknown>;
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

function formatLog(entry: LogEntry): string {
  const parts = [
    entry.timestamp,
    `[${entry.level.toUpperCase()}]`,
    entry.context ? `[${entry.context}]` : '',
    entry.message,
  ].filter(Boolean);

  let output = parts.join(' ');

  if (entry.data && Object.keys(entry.data).length > 0) {
    output += ` ${JSON.stringify(entry.data)}`;
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

  const output = formatLog(entry);

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
