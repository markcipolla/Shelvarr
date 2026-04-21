'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { setKapowarrSettings, testKapowarrConnection } from '@/lib/actions/settings';

interface KapowarrSettings {
  url: string | null;
  hasApiKey: boolean;
}

interface KapowarrTabProps {
  settings: KapowarrSettings;
}

export function KapowarrTab({ settings }: KapowarrTabProps) {
  const router = useRouter();
  const [url, setUrl] = useState(settings.url || '');
  const [apiKey, setApiKey] = useState('');
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{
    success: boolean;
    error?: string;
  } | null>(null);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    await setKapowarrSettings(url, apiKey || undefined);
    router.refresh();
    setSaving(false);
  };

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    const result = await testKapowarrConnection();
    setTestResult(result);
    setTesting(false);
  };

  return (
    <div className="max-w-xl">
      <p className="text-shelvarr-text-muted mb-6">
        Connect to your Kapowarr instance to browse and serve comics.
      </p>

      <form onSubmit={handleSave} className="space-y-4">
        <div>
          <label
            htmlFor="kapowarr-url"
            className="block text-sm font-medium text-shelvarr-text-muted mb-1"
          >
            Kapowarr URL
          </label>
          <input
            type="url"
            id="kapowarr-url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="http://localhost:5656"
            className="w-full bg-shelvarr-surface border border-shelvarr-border rounded-lg px-3 py-2 text-white placeholder-shelvarr-text-muted focus:outline-none focus:border-blue-500"
          />
        </div>

        <div>
          <label
            htmlFor="kapowarr-api-key"
            className="block text-sm font-medium text-shelvarr-text-muted mb-1"
          >
            API Key
          </label>
          <input
            type="password"
            id="kapowarr-api-key"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder={settings.hasApiKey ? '••••••••' : 'Enter API key'}
            className="w-full bg-shelvarr-surface border border-shelvarr-border rounded-lg px-3 py-2 text-white placeholder-shelvarr-text-muted focus:outline-none focus:border-blue-500"
          />
          {settings.hasApiKey && (
            <p className="mt-1 text-xs text-shelvarr-text-muted">
              Leave blank to keep existing API key
            </p>
          )}
          <p className="mt-1 text-xs text-shelvarr-text-muted">
            Find your API key in Kapowarr Settings → General → Security
          </p>
        </div>

        {testResult && (
          <div
            className={`p-3 rounded-lg ${
              testResult.success
                ? 'bg-green-600/20 text-green-400'
                : 'bg-red-600/20 text-red-400'
            }`}
          >
            {testResult.success
              ? 'Connection successful!'
              : `Connection failed: ${testResult.error}`}
          </div>
        )}

        <div className="flex gap-3 pt-2">
          <button
            type="submit"
            disabled={saving}
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium transition-colors disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save'}
          </button>

          <button
            type="button"
            onClick={handleTest}
            disabled={testing || !url}
            className="bg-shelvarr-surface hover:bg-shelvarr-border text-white border border-shelvarr-border px-4 py-2 rounded-lg font-medium transition-colors disabled:opacity-50"
          >
            {testing ? 'Testing...' : 'Test Connection'}
          </button>
        </div>
      </form>
    </div>
  );
}
