/**
 * A Model Context Protocol server over Shelvarr's diagnostics.
 *
 * This is a hand-rolled implementation of the Streamable HTTP transport's
 * simple half: the client POSTs a JSON-RPC message, we answer with a single
 * JSON response. That is all the spec requires of a server that never pushes
 * anything of its own accord, and it means no SSE stream to hold open, no
 * session ids to track, and no dependency to keep in step with a spec that is
 * still moving.
 *
 * Transport-agnostic on purpose — it takes a parsed message and returns a
 * response — so the HTTP route stays a dozen lines and this stays testable.
 */

import { APP_VERSION } from '../constants';
import type { TaskStatus, TaskType } from '../queue/index';
import type { LogLevel } from '../utils/logger';
import {
  getSystemStatus,
  getTask,
  listComicDownloads,
  listTasks,
  searchLogs,
} from './diagnostics';

/**
 * The spec revision this server implements. Echoed back to a client that asks
 * for it; a client asking for anything else is told what we actually speak
 * and left to decide, which is what the spec prescribes.
 */
export const MCP_PROTOCOL_VERSION = '2025-06-18';

const SUPPORTED_PROTOCOL_VERSIONS = new Set([
  '2025-06-18',
  '2025-03-26',
  '2024-11-05',
]);

export const MCP_SERVER_NAME = 'shelvarr-admin';

/** Shown to the model when the server connects, so it knows what this is for. */
const INSTRUCTIONS = [
  'Read-only diagnostics for a running Shelvarr server (a self-hosted book and',
  'comic library manager).',
  '',
  'Start with get_status for a snapshot: version, uptime, library counts, task',
  'queue, recurring jobs, download queues and which integrations are configured.',
  'Then use search_logs to read the in-memory log buffer — filter by level,',
  'logger context (e.g. "scheduler", "queue", "getcomics") or a substring.',
  'list_tasks and get_task explain background jobs; list_comic_downloads',
  'explains the comic acquisition queue.',
  '',
  'The log buffer holds only the most recent lines from the running process, so',
  'it starts empty after a restart. Nothing here can change the server.',
].join('\n');

interface JsonRpcRequest {
  jsonrpc?: string;
  id?: string | number | null;
  method?: string;
  params?: Record<string, unknown>;
}

export interface JsonRpcResponse {
  jsonrpc: '2.0';
  id: string | number | null;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

const PARSE_ERROR = -32700;
const INVALID_REQUEST = -32600;
const METHOD_NOT_FOUND = -32601;
const INVALID_PARAMS = -32602;
const INTERNAL_ERROR = -32603;

function ok(id: string | number | null, result: unknown): JsonRpcResponse {
  return { jsonrpc: '2.0', id, result };
}

function fail(
  id: string | number | null,
  code: number,
  message: string,
  data?: unknown
): JsonRpcResponse {
  return { jsonrpc: '2.0', id, error: { code, message, ...(data ? { data } : {}) } };
}

const LOG_LEVELS: LogLevel[] = ['debug', 'info', 'warn', 'error'];

const TASK_STATUSES: TaskStatus[] = ['pending', 'running', 'completed', 'failed', 'cancelled'];

export const MCP_TOOLS = [
  {
    name: 'get_status',
    title: 'Server status',
    description:
      'A full snapshot of the running server: version and uptime, database size, ' +
      'library counts (books, series, comic volumes and issues), task queue stats ' +
      'and anything currently running, recurring job schedules with their next run, ' +
      'download queue states, and which integrations are configured. Start here.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'search_logs',
    title: 'Search logs',
    description:
      "Read the running process's in-memory log buffer, oldest match first. " +
      'Filter by minimum level, by the logger that emitted the line, by a ' +
      'substring, or by time. The buffer holds a bounded number of recent lines ' +
      'and is empty after a restart.',
    inputSchema: {
      type: 'object',
      properties: {
        level: {
          type: 'string',
          enum: LOG_LEVELS,
          description: 'Minimum level to include. Omit for everything buffered.',
        },
        context: {
          type: 'string',
          description:
            'Logger name to match, case-insensitive substring, e.g. "scheduler", ' +
            '"queue", "getcomics", "comicvine", "scan".',
        },
        search: {
          type: 'string',
          description: 'Case-insensitive substring matched against the message and its data.',
        },
        since: {
          type: 'string',
          description: 'ISO 8601 timestamp; only lines at or after it.',
        },
        afterSequence: {
          type: 'integer',
          description:
            'Only lines with a sequence number above this. Use the last sequence ' +
            'you saw to poll for new lines without re-reading old ones.',
        },
        limit: {
          type: 'integer',
          minimum: 1,
          maximum: 1000,
          description: 'How many of the most recent matches to return. Default 100.',
        },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'list_tasks',
    title: 'List background tasks',
    description:
      'Background jobs — library scans, metadata lookups, comic searches, ' +
      'downloads, renames — newest first, with their progress and any error.',
    inputSchema: {
      type: 'object',
      properties: {
        status: { type: 'string', enum: TASK_STATUSES },
        type: {
          type: 'string',
          description: 'Task type, e.g. "comic_scan", "metadata", "book_scan_all".',
        },
        limit: { type: 'integer', minimum: 1, maximum: 200, description: 'Default 25.' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'get_task',
    title: 'Get one task',
    description: 'One background job in full, including its result payload and error text.',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'integer', description: 'The task id.' } },
      required: ['id'],
      additionalProperties: false,
    },
  },
  {
    name: 'list_comic_downloads',
    title: 'List comic downloads',
    description:
      'The comic acquisition queue, newest first: which volume and issue, which ' +
      'host, how far along, how many attempts, and why anything failed.',
    inputSchema: {
      type: 'object',
      properties: {
        state: {
          type: 'string',
          enum: ['queued', 'downloading', 'importing', 'completed', 'failed', 'cancelled'],
        },
        limit: { type: 'integer', minimum: 1, maximum: 200, description: 'Default 25.' },
      },
      additionalProperties: false,
    },
  },
] as const;

/** A tool result: the JSON, both as text for the model and as structured content. */
function toolResult(payload: unknown) {
  return {
    content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }],
    structuredContent: payload as Record<string, unknown>,
  };
}

function toolError(message: string) {
  return { content: [{ type: 'text', text: message }], isError: true };
}

function optionalString(args: Record<string, unknown>, key: string): string | undefined {
  const value = args[key];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function optionalInteger(args: Record<string, unknown>, key: string): number | undefined {
  const value = args[key];
  return typeof value === 'number' && Number.isFinite(value) ? Math.floor(value) : undefined;
}

function callTool(name: string, args: Record<string, unknown>) {
  switch (name) {
    case 'get_status':
      return toolResult(getSystemStatus());

    case 'search_logs': {
      const level = optionalString(args, 'level');
      if (level && !LOG_LEVELS.includes(level as LogLevel)) {
        return toolError(`level must be one of: ${LOG_LEVELS.join(', ')}`);
      }
      const context = optionalString(args, 'context');
      const search = optionalString(args, 'search');
      const since = optionalString(args, 'since');
      const afterSequence = optionalInteger(args, 'afterSequence');
      const logLimit = optionalInteger(args, 'limit');

      return toolResult(
        searchLogs({
          ...(level ? { minLevel: level as LogLevel } : {}),
          ...(context ? { context } : {}),
          ...(search ? { search } : {}),
          ...(since ? { since } : {}),
          ...(afterSequence !== undefined ? { afterSequence } : {}),
          ...(logLimit !== undefined ? { limit: logLimit } : {}),
        })
      );
    }

    case 'list_tasks': {
      const status = optionalString(args, 'status');
      if (status && !TASK_STATUSES.includes(status as TaskStatus)) {
        return toolError(`status must be one of: ${TASK_STATUSES.join(', ')}`);
      }
      const type = optionalString(args, 'type');
      const taskLimit = optionalInteger(args, 'limit');

      return toolResult(
        listTasks({
          ...(status ? { status: status as TaskStatus } : {}),
          ...(type ? { type: type as TaskType } : {}),
          ...(taskLimit !== undefined ? { limit: taskLimit } : {}),
        })
      );
    }

    case 'get_task': {
      const id = optionalInteger(args, 'id');
      if (id === undefined) return toolError('id is required and must be a number');
      const task = getTask(id);
      return task ? toolResult(task) : toolError(`No task with id ${id}`);
    }

    case 'list_comic_downloads': {
      const state = optionalString(args, 'state');
      const downloadLimit = optionalInteger(args, 'limit');

      return toolResult({
        downloads: listComicDownloads({
          ...(state ? { state } : {}),
          ...(downloadLimit !== undefined ? { limit: downloadLimit } : {}),
        }),
      });
    }

    default:
      return null;
  }
}

/**
 * Handle one JSON-RPC message.
 *
 * Returns null for a notification, which by JSON-RPC gets no reply at all —
 * the caller turns that into a 202 with an empty body.
 */
export function handleMcpMessage(message: unknown): JsonRpcResponse | null {
  if (typeof message !== 'object' || message === null || Array.isArray(message)) {
    return fail(null, INVALID_REQUEST, 'Expected a JSON-RPC 2.0 object');
  }

  const { id, method, params } = message as JsonRpcRequest;
  const requestId = id ?? null;

  if (typeof method !== 'string') {
    return fail(requestId, INVALID_REQUEST, 'Missing "method"');
  }

  // Notifications carry no id and are answered with silence.
  if (id === undefined || id === null) {
    if (method.startsWith('notifications/')) return null;
  }

  try {
    switch (method) {
      case 'initialize': {
        const requested = (params?.['protocolVersion'] as string | undefined) ?? '';
        return ok(requestId, {
          protocolVersion: SUPPORTED_PROTOCOL_VERSIONS.has(requested)
            ? requested
            : MCP_PROTOCOL_VERSION,
          capabilities: { tools: { listChanged: false } },
          serverInfo: { name: MCP_SERVER_NAME, title: 'Shelvarr admin', version: APP_VERSION },
          instructions: INSTRUCTIONS,
        });
      }

      case 'ping':
        return ok(requestId, {});

      case 'tools/list':
        return ok(requestId, { tools: MCP_TOOLS });

      case 'tools/call': {
        const name = params?.['name'];
        if (typeof name !== 'string') {
          return fail(requestId, INVALID_PARAMS, 'tools/call needs a "name"');
        }
        const args = (params?.['arguments'] as Record<string, unknown> | undefined) ?? {};
        const result = callTool(name, args);
        if (result === null) {
          return fail(requestId, INVALID_PARAMS, `Unknown tool: ${name}`);
        }
        return ok(requestId, result);
      }

      // Not advertised in `capabilities`, but clients ask anyway. An empty
      // list is a quieter answer than an error.
      case 'resources/list':
        return ok(requestId, { resources: [] });
      case 'resources/templates/list':
        return ok(requestId, { resourceTemplates: [] });
      case 'prompts/list':
        return ok(requestId, { prompts: [] });

      default:
        if (method.startsWith('notifications/')) return null;
        return fail(requestId, METHOD_NOT_FOUND, `Unknown method: ${method}`);
    }
  } catch (error) {
    return fail(
      requestId,
      INTERNAL_ERROR,
      error instanceof Error ? error.message : 'Internal error'
    );
  }
}

/** Handle a whole POST body, which older clients may send as a batch. */
export function handleMcpBody(body: unknown): JsonRpcResponse[] | JsonRpcResponse | null {
  if (Array.isArray(body)) {
    if (body.length === 0) return fail(null, INVALID_REQUEST, 'Empty batch');
    const responses = body
      .map((message) => handleMcpMessage(message))
      .filter((response): response is JsonRpcResponse => response !== null);
    return responses.length > 0 ? responses : null;
  }
  return handleMcpMessage(body);
}

/** A JSON-RPC parse error, for a body that was not JSON at all. */
export function mcpParseError(): JsonRpcResponse {
  return fail(null, PARSE_ERROR, 'Request body is not valid JSON');
}
