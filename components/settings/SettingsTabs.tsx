'use client';

import { useState } from 'react';
import { MetadataSourcesTab } from './MetadataSourcesTab';
import { KomgaTab } from './KomgaTab';
import { AboutTab } from './AboutTab';

interface SourceStatus {
  name: 'hardcover';
  displayName: string;
  enabled: boolean;
  configured: boolean;
  requiresApiKey: boolean;
  apiKeyUrl?: string;
}

interface KomgaSettings {
  url: string | null;
  username: string | null;
  hasPassword: boolean;
}

interface SettingsTabsProps {
  sources: SourceStatus[];
  komga: KomgaSettings;
}

type TabId = 'sources' | 'komga' | 'about';

export function SettingsTabs({ sources, komga }: SettingsTabsProps) {
  const [activeTab, setActiveTab] = useState<TabId>('sources');

  const tabs: { id: TabId; label: string }[] = [
    { id: 'sources', label: 'Metadata Sources' },
    { id: 'komga', label: 'Komga' },
    { id: 'about', label: 'About' },
  ];

  return (
    <div>
      <div className="border-b border-shelvarr-border">
        <nav className="flex gap-4">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2 -mb-px text-sm font-medium transition-colors ${
                activeTab === tab.id
                  ? 'text-white border-b-2 border-blue-500'
                  : 'text-shelvarr-text-muted hover:text-white'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      <div className="py-6">
        {activeTab === 'sources' && <MetadataSourcesTab sources={sources} />}
        {activeTab === 'komga' && <KomgaTab settings={komga} />}
        {activeTab === 'about' && <AboutTab />}
      </div>
    </div>
  );
}
