'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { setKomgaSettings, testKomgaConnection } from '@/lib/actions/settings';

interface KomgaSettings {
  url: string | null;
  username: string | null;
  hasPassword: boolean;
}

interface KomgaTabProps {
  settings: KomgaSettings;
}

export function KomgaTab({ settings }: KomgaTabProps) {
  const router = useRouter();
  const [url, setUrl] = useState(settings.url || '');
  const [username, setUsername] = useState(settings.username || '');
  const [password, setPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{
    success: boolean;
    error?: string;
  } | null>(null);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    await setKomgaSettings(url, username, password || undefined);
    router.refresh();
    setSaving(false);
  };

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    const result = await testKomgaConnection();
    setTestResult(result);
    setTesting(false);
  };

  return (
    <div className="max-w-xl">
      <p className="text-shelvarr-text-muted mb-6">
        Connect to your Komga instance to sync libraries and trigger scans.
      </p>

      <form onSubmit={handleSave} className="space-y-4">
        <div>
          <label
            htmlFor="komga-url"
            className="block text-sm font-medium text-shelvarr-text-muted mb-1"
          >
            Komga URL
          </label>
          <input
            type="url"
            id="komga-url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="http://localhost:25600"
            className="w-full bg-shelvarr-surface border border-shelvarr-border rounded-lg px-3 py-2 text-white placeholder-shelvarr-text-muted focus:outline-none focus:border-blue-500"
          />
        </div>

        <div>
          <label
            htmlFor="komga-username"
            className="block text-sm font-medium text-shelvarr-text-muted mb-1"
          >
            Username
          </label>
          <input
            type="text"
            id="komga-username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="admin"
            className="w-full bg-shelvarr-surface border border-shelvarr-border rounded-lg px-3 py-2 text-white placeholder-shelvarr-text-muted focus:outline-none focus:border-blue-500"
          />
        </div>

        <div>
          <label
            htmlFor="komga-password"
            className="block text-sm font-medium text-shelvarr-text-muted mb-1"
          >
            Password
          </label>
          <input
            type="password"
            id="komga-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={settings.hasPassword ? '••••••••' : 'Enter password'}
            className="w-full bg-shelvarr-surface border border-shelvarr-border rounded-lg px-3 py-2 text-white placeholder-shelvarr-text-muted focus:outline-none focus:border-blue-500"
          />
          {settings.hasPassword && (
            <p className="mt-1 text-xs text-shelvarr-text-muted">
              Leave blank to keep existing password
            </p>
          )}
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
            disabled={testing || !url || !username}
            className="bg-shelvarr-surface hover:bg-shelvarr-border text-white border border-shelvarr-border px-4 py-2 rounded-lg font-medium transition-colors disabled:opacity-50"
          >
            {testing ? 'Testing...' : 'Test Connection'}
          </button>
        </div>
      </form>
    </div>
  );
}
