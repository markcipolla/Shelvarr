'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  setApiKey,
  setComicVineDateType,
  syncHardcoverStatus,
  testSourceConnection,
  toggleSource,
  type MetadataSourceStatus,
} from '@/lib/actions/settings';

interface MetadataSourcesTabProps {
  sources: MetadataSourceStatus[];
  /** Which ComicVine date issues are dated by. */
  comicVineDateType: string;
}

export function MetadataSourcesTab({ sources, comicVineDateType }: MetadataSourcesTabProps) {
  return (
    <div className="space-y-4">
      <div className="space-y-3">
        {sources.map((source) => (
          <SourceRow key={source.name} source={source} comicVineDateType={comicVineDateType} />
        ))}
      </div>
    </div>
  );
}

function SourceRow({
  source,
  comicVineDateType,
}: {
  source: MetadataSourceStatus;
  comicVineDateType: string;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);
  const [apiKey, setApiKeyValue] = useState('');
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; error?: string } | null>(null);
  const [dateType, setDateType] = useState(comicVineDateType);
  const [savingDateType, setSavingDateType] = useState(false);

  const handleSyncStatus = async () => {
    setSyncing(true);
    setSyncMessage(null);
    const result = await syncHardcoverStatus();
    setSyncMessage(
      result.success
        ? `Synced ${result.synced ?? 0} reading ${result.synced === 1 ? 'status' : 'statuses'}`
        : result.error || 'Sync failed'
    );
    router.refresh();
    setSyncing(false);
  };

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    setTestResult(await testSourceConnection(source.name));
    setTesting(false);
  };

  const handleToggle = async () => {
    setLoading(true);
    await toggleSource(source.name, !source.enabled);
    router.refresh();
    setLoading(false);
  };

  const handleSaveApiKey = async () => {
    setLoading(true);
    await setApiKey(source.name, apiKey);
    router.refresh();
    setLoading(false);
    setShowApiKey(false);
    setApiKeyValue('');
  };

  const handleDateTypeChange = async (value: string) => {
    setDateType(value);
    setSavingDateType(true);
    await setComicVineDateType(value);
    router.refresh();
    setSavingDateType(false);
  };

  return (
    <div
      data-testid={`source-${source.name}`}
      className="bg-shelvarr-surface border border-shelvarr-border rounded-lg p-4"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div>
            <div className="font-medium text-white">
              {source.displayName}
              <span className="ml-2 text-xs text-shelvarr-text-muted font-normal">
                {source.mediaType}
              </span>
            </div>
            <div className="text-sm text-shelvarr-text-muted">
              {source.requiresApiKey ? (
                source.configured ? (
                  <span className="text-green-400">API key configured</span>
                ) : (
                  <span className="text-yellow-400">API key required</span>
                )
              ) : (
                <span className="text-green-400">No API key required</span>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {source.name === 'hardcover' && source.configured && (
            <button
              onClick={handleSyncStatus}
              disabled={syncing}
              className="text-sm text-blue-400 hover:text-blue-300 transition-colors disabled:opacity-50"
            >
              {syncing ? 'Syncing…' : 'Sync reading status'}
            </button>
          )}

          {source.canTest && (
            <button
              onClick={handleTest}
              disabled={testing || !source.configured}
              className="text-sm text-blue-400 hover:text-blue-300 transition-colors disabled:opacity-50"
            >
              {testing ? 'Testing…' : 'Test connection'}
            </button>
          )}

          {source.requiresApiKey && (
            <button
              onClick={() => setShowApiKey(!showApiKey)}
              className="text-sm text-blue-400 hover:text-blue-300 transition-colors"
            >
              {source.configured ? 'Update API Key' : 'Add API Key'}
            </button>
          )}

          <button
            onClick={handleToggle}
            disabled={loading || (source.requiresApiKey && !source.configured)}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
              source.enabled ? 'bg-blue-600' : 'bg-shelvarr-bg'
            } ${
              loading || (source.requiresApiKey && !source.configured)
                ? 'opacity-50 cursor-not-allowed'
                : ''
            }`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                source.enabled ? 'translate-x-6' : 'translate-x-1'
              }`}
            />
          </button>
        </div>
      </div>

      {syncMessage && (
        <p className="mt-3 text-sm text-shelvarr-text-muted">{syncMessage}</p>
      )}

      {testResult && (
        <p className={`mt-3 text-sm ${testResult.success ? 'text-green-400' : 'text-red-400'}`}>
          {testResult.success
            ? `Connected to ${source.displayName}`
            : testResult.error ?? 'Connection failed'}
        </p>
      )}

      {showApiKey && (
        <div className="mt-4 pt-4 border-t border-shelvarr-border">
          <div className="flex gap-2">
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKeyValue(e.target.value)}
              placeholder="Enter API key"
              className="flex-1 bg-shelvarr-bg border border-shelvarr-border rounded-lg px-3 py-2 text-white placeholder-shelvarr-text-muted focus:outline-none focus:border-blue-500"
            />
            <button
              onClick={handleSaveApiKey}
              disabled={!apiKey || loading}
              className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium transition-colors disabled:opacity-50"
            >
              Save
            </button>
          </div>
          {source.apiKeyUrl && (
            <p className="mt-2 text-sm text-shelvarr-text-muted">
              Get your API key at:{' '}
              <a
                href={source.apiKeyUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-400 hover:text-blue-300"
              >
                {source.apiKeyUrl}
              </a>
            </p>
          )}
        </div>
      )}

      {source.name === 'comicvine' && (
        <div className="mt-4 pt-4 border-t border-shelvarr-border">
          <label
            htmlFor="cv-date-type"
            className="block text-sm font-medium text-shelvarr-text-muted mb-1"
          >
            Issue release date
          </label>
          <select
            id="cv-date-type"
            value={dateType}
            disabled={savingDateType}
            onChange={(e) => handleDateTypeChange(e.target.value)}
            className="bg-shelvarr-bg border border-shelvarr-border rounded-lg px-3 py-2 text-white focus:outline-none focus:border-blue-500 disabled:opacity-50"
          >
            <option value="cover_date">Cover date</option>
            <option value="store_date">Store date</option>
          </select>
        </div>
      )}
    </div>
  );
}
