'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toggleSource, setApiKey } from '@/lib/actions/settings';

interface SourceStatus {
  name: 'hardcover';
  displayName: string;
  enabled: boolean;
  configured: boolean;
  requiresApiKey: boolean;
  apiKeyUrl?: string;
}

interface MetadataSourcesTabProps {
  sources: SourceStatus[];
}

export function MetadataSourcesTab({ sources }: MetadataSourcesTabProps) {
  return (
    <div className="space-y-4">
      <div className="space-y-3">
        {sources.map((source) => (
          <SourceRow key={source.name} source={source} />
        ))}
      </div>
    </div>
  );
}

function SourceRow({ source }: { source: SourceStatus }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);
  const [apiKey, setApiKeyValue] = useState('');

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

  return (
    <div className="bg-shelvarr-surface border border-shelvarr-border rounded-lg p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div>
            <div className="font-medium text-white">{source.displayName}</div>
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
    </div>
  );
}
