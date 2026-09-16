'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  toggleDownloadSource,
  saveZLibraryCredentials,
  clearZLibraryCredentials,
  saveAnnasApiKey,
  clearAnnasApiKey,
  testDownloadSource,
  refreshDownloadSourceStatuses,
  getDownloadParserHealth,
} from '@/lib/actions/downloads';
import type { DownloadSourceConfig } from '@/lib/db';
import type { SourceStatus, ParserHealth } from '@/lib/services/downloads';
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
  /** Whether downloads are unusable at all without credentials configured here. */
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

// Kept in sync with SHADOW_LIBRARY_SOURCES in packages/db/src/index.ts.
const SHADOW_LIBRARY_SOURCES = new Set(['zlibrary', 'annas', 'libgen']);

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
    description:
      'Search engine for shadow libraries. Works with no account via a scraped, Cloudflare-gated path; a member API key enables a faster, reliable download path instead.',
    category: 'ebook',
    requiresAuth: false,
    authFields: [{ name: 'apiKey', type: 'text', label: 'API Key (optional)' }],
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
  const [parserHealth, setParserHealth] = useState<ParserHealth[]>([]);

  useEffect(() => {
    getDownloadParserHealth().then(setParserHealth).catch(() => {});
  }, []);

  const handleRefreshStatuses = async () => {
    setRefreshing(true);
    await refreshDownloadSourceStatuses();
    router.refresh();
    setRefreshing(false);
  };

  const getConfig = (source: string) => configs.find((c) => c.source === source);
  const getStatus = (source: string) => statuses.find((s) => s.name === source);
  const getParserHealthFor = (source: string) => parserHealth.find((p) => p.source === source);

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
                  parserHealth={getParserHealthFor(source.name)}
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
  parserHealth,
}: {
  source: SourceInfo;
  config?: DownloadSourceConfig;
  status?: SourceStatus;
  parserHealth?: ParserHealth;
}) {
  const router = useRouter();
  const toast = useToast();
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [fieldValues, setFieldValues] = useState<Record<string, string>>({});

  // Mirrors isSourceEnabled: no config row means shadow libraries
  // (zlibrary, annas, libgen) default off; other sources default on.
  const isEnabled =
    config != null ? config.enabled === 1 : !SHADOW_LIBRARY_SOURCES.has(source.name);
  const hasCredentials = config?.credentials != null;
  const hasAuthFields = (source.authFields?.length ?? 0) > 0;
  const fieldsFilled = source.authFields?.every((field) => fieldValues[field.name]) ?? false;

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

  // Z-Library's credentials (email/password) are authenticated up front, the
  // same way they always have been; Anna's Archive's is a bare API key with
  // nothing to authenticate — it's just stored for resolveAnnasDownload to
  // prefer over the free scraped path.
  const handleSaveCredentials = async () => {
    if (!fieldsFilled) return;
    setLoading(true);
    const result =
      source.name === 'zlibrary'
        ? await saveZLibraryCredentials(fieldValues.email!, fieldValues.password!)
        : await saveAnnasApiKey(fieldValues.apiKey!);
    if (result.success) {
      setFieldValues({});
      setExpanded(false);
      toast.success(source.name === 'zlibrary' ? 'Credentials saved' : 'API key saved');
    } else {
      toast.error(result.error || 'Failed to save');
    }
    router.refresh();
    setLoading(false);
  };

  const handleClearCredentials = async () => {
    if (!confirm('Clear saved credentials?')) return;
    setLoading(true);
    if (source.name === 'zlibrary') await clearZLibraryCredentials();
    else await clearAnnasApiKey();
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
            {parserHealth?.suspect && (
              <p className="flex items-center gap-1 text-xs text-amber-400 mt-1">
                <WarningIcon />
                Parser may be broken — {parserHealth.consecutiveFailures} searches in a row
                didn&apos;t match this source&apos;s expected page structure.
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {hasAuthFields && hasCredentials && (
            <span className="text-xs text-green-400 bg-green-400/20 px-2 py-1 rounded">
              {source.requiresAuth ? 'Authenticated' : 'Configured'}
            </span>
          )}
          <button
            onClick={handleTest}
            disabled={testing}
            className="text-sm text-shelvarr-text-muted hover:text-white transition-colors"
          >
            {testing ? 'Testing...' : 'Test'}
          </button>
          {hasAuthFields && (
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

      {hasAuthFields && expanded && (
        <div className="p-4 border-t border-shelvarr-border bg-shelvarr-bg/50">
          {hasCredentials ? (
            <div className="flex items-center justify-between">
              <span className="text-sm text-shelvarr-text-muted">
                {source.requiresAuth
                  ? 'Credentials saved. Downloads will use your account.'
                  : 'API key saved. Downloads will use the member download path.'}
              </span>
              <button
                onClick={handleClearCredentials}
                disabled={loading}
                className="text-sm text-red-400 hover:text-red-300 transition-colors"
              >
                Clear {source.requiresAuth ? 'Credentials' : 'API Key'}
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-shelvarr-text-muted">
                {source.requiresAuth
                  ? `Enter your ${source.displayName} credentials to enable downloads:`
                  : `Enter your ${source.displayName} member API key for faster, reliable downloads:`}
              </p>
              {source.authFields?.map((field) => (
                <input
                  key={field.name}
                  type={field.type}
                  placeholder={field.label}
                  value={fieldValues[field.name] ?? ''}
                  onChange={(e) =>
                    setFieldValues((prev) => ({ ...prev, [field.name]: e.target.value }))
                  }
                  className="w-full bg-shelvarr-bg border border-shelvarr-border rounded-lg px-3 py-2 text-white placeholder-shelvarr-text-muted focus:outline-none focus:border-blue-500"
                />
              ))}
              <button
                onClick={handleSaveCredentials}
                disabled={loading || !fieldsFilled}
                className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
              >
                {loading ? 'Saving...' : source.requiresAuth ? 'Save Credentials' : 'Save API Key'}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function WarningIcon() {
  return (
    <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z"
      />
    </svg>
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
