'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { saveBackupSettingsAction, type BackupSettings as Settings, type LocalBackup } from '@/lib/actions/backup';
import type { ScheduleView } from '@/lib/actions/settings';
import { RecurringJobs } from './RecurringJobs';

const inputClass =
  'bg-shelvarr-surface border border-shelvarr-border rounded-lg px-3 py-2 text-white placeholder-shelvarr-text-muted focus:outline-none focus:border-blue-500';

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB'];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(1)} ${units[unit]}`;
}

export function BackupSettings({
  settings,
  backups,
  schedule,
}: {
  settings: Settings;
  backups: LocalBackup[];
  schedule: ScheduleView | null;
}) {
  const router = useRouter();
  const [form, setForm] = useState({ ...settings, applicationKey: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const update = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
    setSaved(false);
  };

  const handleSave = async () => {
    setBusy(true);
    setError(null);
    const result = await saveBackupSettingsAction({
      b2Enabled: form.b2Enabled,
      keyId: form.keyId,
      bucket: form.bucket,
      prefix: form.prefix,
      applicationKey: form.applicationKey,
      keep: form.keep,
    });
    setBusy(false);

    if (!result.success) {
      setError(result.error);
      return;
    }
    setForm({ ...result.settings, applicationKey: '' });
    setSaved(true);
    router.refresh();
  };

  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-white">Backups</h2>
        <p className="text-sm text-shelvarr-text-muted mt-1">
          A snapshot of the database — your library, settings, read progress and download
          history. Books and comics themselves are not copied; those are the files you already
          have. Snapshots are written to <code>data/backups</code>, which is on the same volume
          as the thing being backed up, so point them at Backblaze too if the disk dying is a
          case you want covered.
        </p>
      </div>

      <label className="block text-sm">
        <span className="text-white">Keep</span>
        <input
          type="number"
          min={1}
          max={365}
          value={form.keep}
          onChange={(event) => update('keep', Number(event.target.value))}
          className={`${inputClass} w-24 ml-2`}
        />
        <span className="text-shelvarr-text-muted ml-2">snapshots, here and at Backblaze</span>
      </label>

      <label className="flex items-start gap-3 cursor-pointer">
        <input
          type="checkbox"
          checked={form.b2Enabled}
          onChange={(event) => update('b2Enabled', event.target.checked)}
          className="mt-1"
        />
        <span className="text-sm">
          <span className="text-white">Upload to Backblaze B2</span>
          <span className="block text-shelvarr-text-muted">
            Create an application key with write access to one bucket. The snapshot and the
            <code> .secret-key</code> that opens the credentials inside it both go up — anyone
            holding the bucket can read your saved passwords, so scope the key to it.
          </span>
        </span>
      </label>

      <div className="grid gap-3 sm:grid-cols-2 max-w-2xl">
        <label className="text-sm">
          <span className="block text-shelvarr-text-muted mb-1">Key ID</span>
          <input
            value={form.keyId}
            onChange={(event) => update('keyId', event.target.value)}
            className={`${inputClass} w-full`}
            placeholder="0035a1b2c3…"
          />
        </label>

        <label className="text-sm">
          <span className="block text-shelvarr-text-muted mb-1">
            Application key{form.hasApplicationKey ? ' (saved)' : ''}
          </span>
          <input
            type="password"
            value={form.applicationKey}
            onChange={(event) => update('applicationKey', event.target.value)}
            className={`${inputClass} w-full`}
            placeholder={form.hasApplicationKey ? 'Leave blank to keep the saved key' : 'K003…'}
          />
        </label>

        <label className="text-sm">
          <span className="block text-shelvarr-text-muted mb-1">Bucket</span>
          <input
            value={form.bucket}
            onChange={(event) => update('bucket', event.target.value)}
            className={`${inputClass} w-full`}
            placeholder="my-shelvarr-backups"
          />
        </label>

        <label className="text-sm">
          <span className="block text-shelvarr-text-muted mb-1">Folder (optional)</span>
          <input
            value={form.prefix}
            onChange={(event) => update('prefix', event.target.value)}
            className={`${inputClass} w-full`}
            placeholder="shelvarr"
          />
        </label>
      </div>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={handleSave}
          disabled={busy}
          className="px-4 py-2 text-sm rounded-lg bg-blue-600 text-white hover:bg-blue-500 disabled:opacity-50"
        >
          {busy ? 'Saving…' : 'Save'}
        </button>
        {saved && <span className="text-sm text-shelvarr-text-muted">Saved.</span>}
        {error && <span className="text-sm text-red-400">{error}</span>}
      </div>

      {schedule && (
        <RecurringJobs
          schedules={[schedule]}
          blurb="Run now takes a snapshot immediately; watch it finish on the Tasks page."
        />
      )}

      <div>
        <h3 className="text-sm font-semibold text-white mb-2">On disk</h3>
        {backups.length === 0 ? (
          <p className="text-sm text-shelvarr-text-muted">
            No snapshots yet. Run the job once to make the first one.
          </p>
        ) : (
          <ul className="text-sm divide-y divide-shelvarr-border border border-shelvarr-border rounded-lg">
            {backups.map((item) => (
              <li key={item.name} className="flex justify-between gap-4 px-3 py-2">
                <span className="text-white truncate">{item.name}</span>
                <span className="text-shelvarr-text-muted whitespace-nowrap">
                  {formatBytes(item.bytes)} · {new Date(item.createdAt).toLocaleString()}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
