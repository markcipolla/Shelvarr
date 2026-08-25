'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  addComicRootFolderAction,
  removeComicRootFolderAction,
  runScheduleNowAction,
  setComicVineSettings,
  setScheduleEnabledAction,
  setScheduleIntervalAction,
  startComicAdoption,
  startComicLibraryImport,
  testComicVineConnection,
  type AdoptionCandidateView,
  type ScheduleView,
} from '@/lib/actions/settings';

interface RootFolder {
  id: number;
  path: string;
  volumeCount: number;
}

interface ComicsSettings {
  hasApiKey: boolean;
  dateType: string;
  rootFolders: RootFolder[];
}

const inputClass =
  'w-full bg-shelvarr-surface border border-shelvarr-border rounded-lg px-3 py-2 text-white placeholder-shelvarr-text-muted focus:outline-none focus:border-blue-500';

/** Interval choices offered in the UI, in seconds. */
const INTERVAL_CHOICES: Array<{ label: string; seconds: number }> = [
  { label: 'Every 6 hours', seconds: 6 * 3600 },
  { label: 'Every 12 hours', seconds: 12 * 3600 },
  { label: 'Daily', seconds: 24 * 3600 },
  { label: 'Every 3 days', seconds: 3 * 24 * 3600 },
  { label: 'Weekly', seconds: 7 * 24 * 3600 },
];

function formatWhen(unixSeconds: number | null): string {
  if (!unixSeconds) return 'never';
  return new Date(unixSeconds * 1000).toLocaleString();
}

export function ComicsTab({
  settings,
  schedules,
  adoptionCandidates,
}: {
  settings: ComicsSettings;
  schedules: ScheduleView[];
  adoptionCandidates: AdoptionCandidateView[];
}) {
  const router = useRouter();
  const [busySchedule, setBusySchedule] = useState<string | null>(null);
  const [scheduleMessage, setScheduleMessage] = useState<string | null>(null);
  const [migrating, setMigrating] = useState(false);
  const [migrateMessage, setMigrateMessage] = useState<string | null>(null);
  const [showBlocked, setShowBlocked] = useState(false);

  const readyToMigrate = adoptionCandidates.filter((candidate) => !candidate.blocker);
  const blockedFromMigrating = adoptionCandidates.filter((candidate) => candidate.blocker);

  const [apiKey, setApiKey] = useState('');
  const [dateType, setDateType] = useState(settings.dateType);
  const [savingKey, setSavingKey] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; error?: string } | null>(null);

  const [newFolder, setNewFolder] = useState('');
  const [folderError, setFolderError] = useState<string | null>(null);
  const [busyFolder, setBusyFolder] = useState(false);

  const [importPath, setImportPath] = useState('');
  const [importMessage, setImportMessage] = useState<string | null>(null);

  const handleSaveKey = async (event: React.FormEvent) => {
    event.preventDefault();
    setSavingKey(true);
    await setComicVineSettings(apiKey || undefined, dateType);
    setApiKey('');
    router.refresh();
    setSavingKey(false);
  };

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    setTestResult(await testComicVineConnection());
    setTesting(false);
  };

  const handleAddFolder = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!newFolder.trim()) return;

    setBusyFolder(true);
    setFolderError(null);
    const result = await addComicRootFolderAction(newFolder.trim());
    if (result.success) setNewFolder('');
    else setFolderError(result.error ?? 'Failed to add root folder');
    router.refresh();
    setBusyFolder(false);
  };

  const handleRemoveFolder = async (id: number) => {
    setBusyFolder(true);
    setFolderError(null);
    const result = await removeComicRootFolderAction(id);
    if (!result.success) setFolderError(result.error ?? 'Failed to remove root folder');
    router.refresh();
    setBusyFolder(false);
  };

  const handleScheduleToggle = async (name: string, enabled: boolean) => {
    setBusySchedule(name);
    setScheduleMessage(null);
    await setScheduleEnabledAction(name, enabled);
    router.refresh();
    setBusySchedule(null);
  };

  const handleScheduleInterval = async (name: string, seconds: number) => {
    setBusySchedule(name);
    setScheduleMessage(null);
    await setScheduleIntervalAction(name, seconds);
    router.refresh();
    setBusySchedule(null);
  };

  const handleScheduleRunNow = async (name: string) => {
    setBusySchedule(name);
    const result = await runScheduleNowAction(name);
    setScheduleMessage(
      result.success
        ? `Started — follow task ${result.taskId} on the Tasks page.`
        : result.error ?? 'Could not start the job'
    );
    router.refresh();
    setBusySchedule(null);
  };

  const handleMigrate = async () => {
    setMigrating(true);
    setMigrateMessage(null);

    const result = await startComicAdoption();
    setMigrateMessage(
      result.success
        ? `Migrating ${result.count} volume${result.count === 1 ? '' : 's'} — follow task ${result.taskId} on the Tasks page.`
        : result.error
    );

    router.refresh();
    setMigrating(false);
  };

  const handleImport = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!importPath.trim()) return;

    const result = await startComicLibraryImport(importPath.trim());
    setImportMessage(
      result.success
        ? `Scanning ${importPath.trim()}. This makes one ComicVine search per folder, so it takes a while — the import review page shows progress.`
        : 'Could not start the import'
    );
  };

  return (
    <div className="max-w-2xl space-y-10">
      {/* ComicVine ------------------------------------------------------- */}
      <section>
        <h2 className="text-lg font-semibold text-white mb-1">ComicVine</h2>
        <p className="text-shelvarr-text-muted mb-4 text-sm">
          Comic metadata comes from ComicVine. Get a free API key at{' '}
          <a
            href="https://comicvine.gamespot.com/api/"
            target="_blank"
            rel="noreferrer"
            className="text-blue-400 hover:underline"
          >
            comicvine.gamespot.com/api
          </a>
          .
        </p>

        <form onSubmit={handleSaveKey} className="space-y-4">
          <div>
            <label htmlFor="cv-api-key" className="block text-sm font-medium text-shelvarr-text-muted mb-1">
              API Key
            </label>
            <input
              type="password"
              id="cv-api-key"
              value={apiKey}
              onChange={(event) => setApiKey(event.target.value)}
              placeholder={settings.hasApiKey ? '••••••••' : 'Enter API key'}
              className={inputClass}
            />
            {settings.hasApiKey && (
              <p className="mt-1 text-xs text-shelvarr-text-muted">
                Leave blank to keep the existing key
              </p>
            )}
          </div>

          <div>
            <label htmlFor="cv-date-type" className="block text-sm font-medium text-shelvarr-text-muted mb-1">
              Issue release date
            </label>
            <select
              id="cv-date-type"
              value={dateType}
              onChange={(event) => setDateType(event.target.value)}
              className={inputClass}
            >
              <option value="cover_date">Cover date</option>
              <option value="store_date">Store date</option>
            </select>
          </div>

          <div className="flex gap-2">
            <button
              type="submit"
              disabled={savingKey}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-lg text-sm font-medium"
            >
              {savingKey ? 'Saving…' : 'Save'}
            </button>
            <button
              type="button"
              onClick={handleTest}
              disabled={testing || !settings.hasApiKey}
              className="px-4 py-2 bg-shelvarr-surface border border-shelvarr-border hover:border-blue-500 disabled:opacity-50 text-white rounded-lg text-sm font-medium"
            >
              {testing ? 'Testing…' : 'Test connection'}
            </button>
          </div>

          {testResult && (
            <p className={`text-sm ${testResult.success ? 'text-green-400' : 'text-red-400'}`}>
              {testResult.success ? 'Connected to ComicVine' : testResult.error}
            </p>
          )}
        </form>
      </section>

      {/* Root folders ---------------------------------------------------- */}
      <section>
        <h2 className="text-lg font-semibold text-white mb-1">Root folders</h2>
        <p className="text-shelvarr-text-muted mb-4 text-sm">
          Where comics are stored. Each volume gets its own folder underneath one of these.
        </p>

        {settings.rootFolders.length === 0 ? (
          <p className="text-sm text-shelvarr-text-muted mb-4">No root folders yet.</p>
        ) : (
          <ul className="mb-4 space-y-2">
            {settings.rootFolders.map((folder) => (
              <li
                key={folder.id}
                className="flex items-center justify-between bg-shelvarr-surface border border-shelvarr-border rounded-lg px-3 py-2"
              >
                <div>
                  <p className="text-white text-sm font-mono">{folder.path}</p>
                  <p className="text-xs text-shelvarr-text-muted">
                    {folder.volumeCount} volume{folder.volumeCount === 1 ? '' : 's'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => handleRemoveFolder(folder.id)}
                  disabled={busyFolder || folder.volumeCount > 0}
                  title={
                    folder.volumeCount > 0
                      ? 'Move or delete its volumes before removing this folder'
                      : undefined
                  }
                  className="text-sm text-red-400 hover:text-red-300 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}

        <form onSubmit={handleAddFolder} className="flex gap-2">
          <input
            type="text"
            value={newFolder}
            onChange={(event) => setNewFolder(event.target.value)}
            placeholder="/libraries/comics"
            className={inputClass}
          />
          <button
            type="submit"
            disabled={busyFolder}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-lg text-sm font-medium whitespace-nowrap"
          >
            Add
          </button>
        </form>
        {folderError && <p className="mt-2 text-sm text-red-400">{folderError}</p>}
      </section>

      {/* Recurring jobs --------------------------------------------------- */}
      <section>
        <h2 className="text-lg font-semibold text-white mb-1">Recurring jobs</h2>
        <p className="text-shelvarr-text-muted mb-4 text-sm">
          Background jobs Shelvarr runs on a timer. The search sweep downloads things, so it
          starts switched off.
        </p>

        <ul className="space-y-3">
          {schedules.map((schedule) => (
            <li
              key={schedule.name}
              className="bg-shelvarr-surface border border-shelvarr-border rounded-lg px-4 py-3"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-white text-sm">{schedule.description || schedule.name}</p>
                  <p className="text-xs text-shelvarr-text-muted mt-1">
                    Last run {formatWhen(schedule.lastRun)}
                    {schedule.enabled && ` · next ${formatWhen(schedule.nextRun)}`}
                  </p>
                </div>

                <label className="flex items-center gap-2 text-sm text-shelvarr-text-muted whitespace-nowrap">
                  <input
                    type="checkbox"
                    checked={schedule.enabled}
                    disabled={busySchedule === schedule.name}
                    onChange={(event) =>
                      handleScheduleToggle(schedule.name, event.target.checked)
                    }
                  />
                  Enabled
                </label>
              </div>

              <div className="flex items-center gap-2 mt-3">
                <select
                  value={schedule.intervalSeconds}
                  disabled={busySchedule === schedule.name}
                  onChange={(event) =>
                    handleScheduleInterval(schedule.name, Number(event.target.value))
                  }
                  className="bg-shelvarr-bg border border-shelvarr-border rounded-lg px-2 py-1 text-sm text-white"
                >
                  {INTERVAL_CHOICES.some(
                    (choice) => choice.seconds === schedule.intervalSeconds
                  ) ? null : (
                    <option value={schedule.intervalSeconds}>
                      Every {Math.round(schedule.intervalSeconds / 3600)} hours
                    </option>
                  )}
                  {INTERVAL_CHOICES.map((choice) => (
                    <option key={choice.seconds} value={choice.seconds}>
                      {choice.label}
                    </option>
                  ))}
                </select>

                <button
                  type="button"
                  onClick={() => handleScheduleRunNow(schedule.name)}
                  disabled={busySchedule === schedule.name}
                  className="px-3 py-1 text-sm rounded-lg border border-shelvarr-border text-white hover:border-blue-500 disabled:opacity-50"
                >
                  Run now
                </button>
              </div>
            </li>
          ))}
        </ul>

        {scheduleMessage && (
          <p className="mt-3 text-sm text-shelvarr-text-muted">{scheduleMessage}</p>
        )}
      </section>

      {/* Migrate a mirrored library ---------------------------------------- */}
      {adoptionCandidates.length > 0 && (
        <section>
          <h2 className="text-lg font-semibold text-white mb-1">Migrate mirrored volumes</h2>
          <p className="text-shelvarr-text-muted mb-4 text-sm">
            {adoptionCandidates.length} volume{adoptionCandidates.length === 1 ? '' : 's'}{' '}
            {adoptionCandidates.length === 1 ? 'is' : 'are'} still mirrored from a previous
            manager. Shelvarr already has their metadata and issue lists, so taking them over
            needs no ComicVine calls and never moves a file.
          </p>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={handleMigrate}
              disabled={migrating || readyToMigrate.length === 0}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-lg text-sm font-medium"
            >
              {migrating
                ? 'Migrating…'
                : `Migrate ${readyToMigrate.length} volume${readyToMigrate.length === 1 ? '' : 's'}`}
            </button>

            {blockedFromMigrating.length > 0 && (
              <button
                type="button"
                onClick={() => setShowBlocked((current) => !current)}
                className="text-sm text-yellow-400 hover:text-yellow-300"
              >
                {showBlocked ? 'Hide' : 'Show'} {blockedFromMigrating.length} blocked
              </button>
            )}
          </div>

          {migrateMessage && (
            <p className="mt-3 text-sm text-shelvarr-text-muted">{migrateMessage}</p>
          )}

          {showBlocked && (
            <ul className="mt-3 space-y-2">
              {blockedFromMigrating.map((candidate) => (
                <li
                  key={candidate.volumeId}
                  className="bg-shelvarr-surface border border-shelvarr-border rounded-lg px-3 py-2"
                >
                  <p className="text-white text-sm">{candidate.title}</p>
                  <p className="text-xs text-yellow-400 mt-0.5">{candidate.blocker}</p>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {/* Library import --------------------------------------------------- */}
      <section>
        <h2 className="text-lg font-semibold text-white mb-1">Import an existing library</h2>
        <p className="text-shelvarr-text-muted mb-4 text-sm">
          Point this at a folder tree you already have — including one Kapowarr was managing — and
          Shelvarr will work out which ComicVine volume each folder is. Nothing is moved or
          renamed; you confirm the matches afterwards.
        </p>

        <form onSubmit={handleImport} className="flex gap-2">
          <input
            type="text"
            value={importPath}
            onChange={(event) => setImportPath(event.target.value)}
            placeholder="/libraries/comics"
            className={inputClass}
          />
          <button
            type="submit"
            disabled={!settings.hasApiKey}
            title={settings.hasApiKey ? undefined : 'Set a ComicVine API key first'}
            className="px-4 py-2 bg-shelvarr-surface border border-shelvarr-border hover:border-blue-500 disabled:opacity-50 text-white rounded-lg text-sm font-medium whitespace-nowrap"
          >
            Scan
          </button>
        </form>
        {importMessage && <p className="mt-2 text-sm text-shelvarr-text-muted">{importMessage}</p>}

        <p className="mt-3 text-sm text-shelvarr-text-muted">
          Once a scan finishes, confirm the matches on the{' '}
          <a href="/comics/import" className="text-shelvarr-primary hover:underline">
            import review page
          </a>
          .
        </p>
      </section>
    </div>
  );
}
