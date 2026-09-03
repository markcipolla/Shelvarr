'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  toggleDownloadSource,
  saveZLibraryCredentials,
  clearZLibraryCredentials,
  testDownloadSource,
  refreshDownloadSourceStatuses,
} from '@/lib/actions/downloads';
import type { DownloadSourceConfig } from '@/lib/db';
import type { SourceStatus } from '@/lib/services/downloads';
import { SourceStatusBadge } from '@/components/wanted/SourceStatusBadge';
import { useToast } from '@/components/ui/Toast';

interface DownloadSourcesTabProps {
  configs: DownloadSourceConfig[];
  statuses: SourceStatus[];
}

type SourceCategory = 'ebook' | 'comic';

interface SourceInfo {
  name: string;
  displayName: string;
  description: string;
  category: SourceCategory;
  requiresAuth: boolean;
  authFields?: { name: string; type: string; label: string }[];
}

const CATEGORIES: { id: SourceCategory; label: string; description: string }[] = [
  {
    id: 'ebook',
    label: 'Ebooks',
    description: 'Sources searched when finding and downloading books',
  },
  {
    id: 'comic',
    label: 'Comics',
    description: 'Sources searched when finding and downloading comic issues',
  },
];

const SOURCES: SourceInfo[] = [
  {
    name: 'zlibrary',
    displayName: 'Z-Library',
    description: 'Largest free e-book library. Authentication required for downloads.',
    category: 'ebook',
    requiresAuth: true,
    authFields: [
      { name: 'email', type: 'email', label: 'Email' },
      { name: 'password', type: 'password', label: 'Password' },
    ],
  },
  {
    name: 'annas',
    displayName: "Anna's Archive",
    description: 'Search engine for shadow libraries. No authentication required.',
    category: 'ebook',
    requiresAuth: false,
  },
  {
    name: 'libgen',
    displayName: 'Library Genesis',
    description: 'Free access to scientific articles and books. No authentication required.',
    category: 'ebook',
    requiresAuth: false,
  },
  {
    name: 'getcomics',
    displayName: 'GetComics',
    description: 'Comic releases indexed by GetComics. No authentication required.',
    category: 'comic',
    requiresAuth: false,
  },
];

export function DownloadSourcesTab({ configs, statuses }: DownloadSourcesTabProps) {
  const router = useRouter();
  const [refreshing, setRefreshing] = useState(false);

  const handleRefreshStatuses = async () => {
    setRefreshing(true);
    await refreshDownloadSourceStatuses();
    router.refresh();
    setRefreshing(false);
  };

  const getConfig = (source: string) => configs.find((c) => c.source === source);
  const getStatus = (source: string) => statuses.find((s) => s.name === source);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-white">Download Sources</h2>
          <p className="text-sm text-shelvarr-text-muted mt-1">
            Configure sources for finding and downloading books and comics
          </p>
        </div>
        <button
          onClick={handleRefreshStatuses}
          disabled={refreshing}
          className="bg-shelvarr-surface border border-shelvarr-border hover:border-shelvarr-primary text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
        >
          {refreshing ? 'Refreshing...' : 'Refresh Status'}
        </button>
      </div>

      {CATEGORIES.map((category) => {
        const sources = SOURCES.filter((source) => source.category === category.id);
        if (sources.length === 0) return null;

        return (
          <section key={category.id} className="space-y-3">
            <div>
              <h3 className="text-sm font-semibold text-white">
                {category.label}
              </h3>
              <p className="text-sm text-shelvarr-text-muted mt-0.5">
                {category.description}
              </p>
            </div>

            <div className="space-y-4">
              {sources.map((source) => (
                <SourceCard
                  key={source.name}
                  source={source}
                  config={getConfig(source.name)}
                  status={getStatus(source.name)}
                />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function SourceCard({
  source,
  config,
  status,
}: {
  source: SourceInfo;
  config?: DownloadSourceConfig;
  status?: SourceStatus;
}) {
  const router = useRouter();
  const toast = useToast();
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const isEnabled = config?.enabled !== 0;
  const hasCredentials = config?.credentials != null;

  const handleToggle = async () => {
    setLoading(true);
    await toggleDownloadSource(source.name, !isEnabled);
    router.refresh();
    setLoading(false);
  };

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    const result = await testDownloadSource(source.name);
    setTestResult({
      success: result.success,
      message: result.success
        ? `Connection successful (${result.responseTime}ms)`
        : 'Connection failed',
    });
    setTesting(false);
  };

  const handleSaveCredentials = async () => {
    if (!email || !password) return;
    setLoading(true);
    const result = await saveZLibraryCredentials(email, password);
    if (result.success) {
      setEmail('');
      setPassword('');
      setExpanded(false);
      toast.success('Credentials saved');
    } else {
      toast.error(result.error || 'Failed to save credentials');
    }
    router.refresh();
    setLoading(false);
  };

  const handleClearCredentials = async () => {
    if (!confirm('Clear saved credentials?')) return;
    setLoading(true);
    await clearZLibraryCredentials();
    router.refresh();
    setLoading(false);
  };

  return (
    <div
      data-testid={`source-${source.name}`}
      className="bg-shelvarr-surface border border-shelvarr-border rounded-lg overflow-hidden"
    >
      <div className="p-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button
            onClick={handleToggle}
            disabled={loading}
            className={`relative w-12 h-6 rounded-full transition-colors ${
              isEnabled ? 'bg-blue-600' : 'bg-shelvarr-bg'
            }`}
          >
            <span
              className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${
                isEnabled ? 'left-7' : 'left-1'
              }`}
            />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-medium text-white">{source.displayName}</h3>
              {status && (
                <SourceStatusBadge status={status.status} showLabel />
              )}
            </div>
            <p className="text-sm text-shelvarr-text-muted">{source.description}</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {source.requiresAuth && hasCredentials && (
            <span className="text-xs text-green-400 bg-green-400/20 px-2 py-1 rounded">
              Authenticated
            </span>
          )}
          <button
            onClick={handleTest}
            disabled={testing}
            className="text-sm text-shelvarr-text-muted hover:text-white transition-colors"
          >
            {testing ? 'Testing...' : 'Test'}
          </button>
          {source.requiresAuth && (
            <button
              onClick={() => setExpanded(!expanded)}
              className="text-shelvarr-text-muted hover:text-white transition-colors"
            >
              <ChevronIcon expanded={expanded} />
            </button>
          )}
        </div>
      </div>

      {testResult && (
        <div
          className={`px-4 py-2 text-sm ${
            testResult.success
              ? 'bg-green-400/10 text-green-400'
              : 'bg-red-400/10 text-red-400'
          }`}
        >
          {testResult.message}
        </div>
      )}

      {source.requiresAuth && expanded && (
        <div className="p-4 border-t border-shelvarr-border bg-shelvarr-bg/50">
          {hasCredentials ? (
            <div className="flex items-center justify-between">
              <span className="text-sm text-shelvarr-text-muted">
                Credentials saved. Downloads will use your account.
              </span>
              <button
                onClick={handleClearCredentials}
                disabled={loading}
                className="text-sm text-red-400 hover:text-red-300 transition-colors"
              >
                Clear Credentials
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-shelvarr-text-muted">
                Enter your {source.displayName} credentials to enable downloads:
              </p>
              {source.authFields?.map((field) => (
                <input
                  key={field.name}
                  type={field.type}
                  placeholder={field.label}
                  value={field.name === 'email' ? email : password}
                  onChange={(e) =>
                    field.name === 'email'
                      ? setEmail(e.target.value)
                      : setPassword(e.target.value)
                  }
                  className="w-full bg-shelvarr-bg border border-shelvarr-border rounded-lg px-3 py-2 text-white placeholder-shelvarr-text-muted focus:outline-none focus:border-blue-500"
                />
              ))}
              <button
                onClick={handleSaveCredentials}
                disabled={loading || !email || !password}
                className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
              >
                {loading ? 'Saving...' : 'Save Credentials'}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ChevronIcon({ expanded }: { expanded: boolean }) {
  return (
    <svg
      className={`w-5 h-5 transition-transform ${expanded ? 'rotate-180' : ''}`}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
    >
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
    </svg>
  );
}
