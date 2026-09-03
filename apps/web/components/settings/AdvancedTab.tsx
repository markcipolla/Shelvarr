'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  getLogTail,
  regenerateAdminApiTokenAction,
  setAdminApiEnabledAction,
  type AdminApiSettings,
  type LogTail,
} from '@/lib/actions/admin';
import type { LogLevel } from '@shelvarr/services/utils/logger';

const LEVELS: LogLevel[] = ['debug', 'info', 'warn', 'error'];

const LEVEL_CLASS: Record<LogLevel, string> = {
  debug: 'text-shelvarr-text-muted',
  info: 'text-blue-400',
  warn: 'text-amber-400',
  error: 'text-red-400',
};

const inputClass =
  'bg-shelvarr-surface border border-shelvarr-border rounded-lg px-3 py-2 text-white placeholder-shelvarr-text-muted focus:outline-none focus:border-blue-500';

export function AdvancedTab({
  settings,
  initialLogs,
}: {
  settings: AdminApiSettings;
  initialLogs: LogTail;
}) {
  const [api, setApi] = useState(settings);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Filled in on the client: the server has no reliable idea which host the
  // browser reached it on, and that is exactly what has to go in the command.
  const [origin, setOrigin] = useState('');
  useEffect(() => setOrigin(window.location.origin), []);

  const [logs, setLogs] = useState(initialLogs);
  const [level, setLevel] = useState<LogLevel | ''>('');
  const [search, setSearch] = useState('');
  const [loadingLogs, setLoadingLogs] = useState(false);

  const refreshLogs = useCallback(async () => {
    setLoadingLogs(true);
    try {
      setLogs(
        await getLogTail({
          ...(level ? { level } : {}),
          ...(search.trim() ? { search: search.trim() } : {}),
          limit: 200,
        })
      );
    } finally {
      setLoadingLogs(false);
    }
  }, [level, search]);

  const runAction = async (action: () => Promise<AdminApiSettings>) => {
    setBusy(true);
    setError(null);
    try {
      setApi(await action());
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Something went wrong');
    } finally {
      setBusy(false);
    }
  };

  const handleRegenerate = () => {
    if (!confirm('Replace the token? Anything using the old one will stop working.')) {
      return;
    }
    void runAction(regenerateAdminApiTokenAction);
  };

  const mcpCommand = `claude mcp add --transport http shelvarr ${origin || 'http://localhost:3000'}/api/mcp --header "Authorization: Bearer ${api.token ?? '<token>'}"`;

  const copyCommand = async () => {
    try {
      await navigator.clipboard.writeText(mcpCommand);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError('Could not reach the clipboard — select the command and copy it by hand.');
    }
  };

  return (
    <div className="max-w-3xl space-y-8">
      <section className="space-y-3">
        <div>
          <h2 className="text-lg font-semibold text-white">Diagnostics API</h2>
          <p className="text-sm text-shelvarr-text-muted mt-1">
            Lets an assistant — or anything else that speaks HTTP — read this server&apos;s logs
            and status. Read-only: nothing it exposes can change your library.
          </p>
        </div>

        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={api.enabled}
            disabled={busy}
            onChange={(event) => void runAction(() => setAdminApiEnabledAction(event.target.checked))}
            className="mt-1"
          />
          <span className="text-sm">
            <span className="text-white">Enable the diagnostics API</span>
            <span className="block text-shelvarr-text-muted">
              Off by default. Logs can include file paths, search terms and email addresses, so
              only turn this on when you want something reading them.
            </span>
          </span>
        </label>

        {error && <p className="text-sm text-red-400">{error}</p>}

        {api.enabled && (
          <div className="space-y-4 bg-shelvarr-surface border border-shelvarr-border rounded-lg p-4">
            <div className="space-y-1">
              <div className="flex items-center justify-between gap-4">
                <span className="text-sm font-medium text-white">Access token</span>
                <button
                  type="button"
                  onClick={handleRegenerate}
                  disabled={busy}
                  className="text-xs text-blue-400 hover:text-blue-300 disabled:opacity-50"
                >
                  Regenerate
                </button>
              </div>
              <code className="block break-all text-xs font-mono text-shelvarr-text-muted bg-shelvarr-bg rounded px-2 py-2">
                {api.token ?? '—'}
              </code>
            </div>

            <div className="space-y-1">
              <div className="flex items-center justify-between gap-4">
                <span className="text-sm font-medium text-white">Connect Claude Code</span>
                <button
                  type="button"
                  onClick={() => void copyCommand()}
                  className="text-xs text-blue-400 hover:text-blue-300"
                >
                  {copied ? 'Copied' : 'Copy'}
                </button>
              </div>
              <code className="block break-all text-xs font-mono text-shelvarr-text-muted bg-shelvarr-bg rounded px-2 py-2">
                {mcpCommand}
              </code>
              <p className="text-xs text-shelvarr-text-muted">
                Or call the same data as plain JSON:{' '}
                <code className="font-mono">/api/admin/status</code>,{' '}
                <code className="font-mono">/api/admin/logs</code> and{' '}
                <code className="font-mono">/api/admin/tasks</code>, with the token as a bearer
                header.
              </p>
            </div>
          </div>
        )}
      </section>

      <section className="space-y-3">
        <div>
          <h2 className="text-lg font-semibold text-white">Recent logs</h2>
          <p className="text-sm text-shelvarr-text-muted mt-1">
            The last {logs.capacity.toLocaleString()} lines from the running server, held in
            memory. Emptied by a restart, and nothing below{' '}
            <code className="font-mono">{logs.level}</code> is recorded — set{' '}
            <code className="font-mono">LOG_LEVEL=debug</code> for more.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            value={level}
            onChange={(event) => setLevel(event.target.value as LogLevel | '')}
            className={inputClass}
          >
            <option value="">All levels</option>
            {LEVELS.map((option) => (
              <option key={option} value={option}>
                {option} and above
              </option>
            ))}
          </select>

          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') void refreshLogs();
            }}
            placeholder="Search messages"
            className={`${inputClass} flex-1 min-w-48`}
          />

          <button
            type="button"
            onClick={() => void refreshLogs()}
            disabled={loadingLogs}
            className="px-3 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm disabled:opacity-50"
          >
            {loadingLogs ? 'Loading…' : 'Refresh'}
          </button>
        </div>

        <div className="bg-shelvarr-bg border border-shelvarr-border rounded-lg overflow-x-auto">
          {logs.entries.length === 0 ? (
            <p className="p-4 text-sm text-shelvarr-text-muted">
              Nothing matching. The buffer holds {logs.buffered.toLocaleString()} lines.
            </p>
          ) : (
            <ul className="divide-y divide-shelvarr-border font-mono text-xs">
              {logs.entries.map((entry) => (
                <li key={entry.sequence} className="px-3 py-1.5 flex gap-3 whitespace-nowrap">
                  <span className="text-shelvarr-text-muted">
                    {entry.timestamp.slice(11, 23)}
                  </span>
                  <span className={`${LEVEL_CLASS[entry.level]} w-12 shrink-0`}>{entry.level}</span>
                  {entry.context && <span className="text-purple-400">[{entry.context}]</span>}
                  <span className="text-white whitespace-pre-wrap break-all">
                    {entry.message}
                    {entry.data && (
                      <span className="text-shelvarr-text-muted"> {entry.data}</span>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <p className="text-xs text-shelvarr-text-muted">
          Showing {logs.entries.length.toLocaleString()} of {logs.matched.toLocaleString()} matching
          lines.
        </p>
      </section>
    </div>
  );
}
