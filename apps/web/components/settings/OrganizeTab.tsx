'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { setOrganizeSettings } from '@/lib/actions/settings';
import { applyTemplate, DEFAULT_ORGANIZE_TEMPLATE } from '@/lib/services/organizer/template';

interface OrganizeSettings {
  template: string;
  autoRun: boolean;
}

interface OrganizeTabProps {
  settings: OrganizeSettings;
}

const SAMPLES = [
  {
    label: 'Series book',
    vars: {
      author: 'Brandon Sanderson',
      title: 'The Way of Kings',
      series: 'The Stormlight Archive',
      number: '001',
      year: '2010',
      isbn: '9780765326355',
      ext: '.epub',
    },
  },
  {
    label: 'Standalone book',
    vars: {
      author: 'Andy Weir',
      title: 'Project Hail Mary',
      series: '',
      number: '',
      year: '2021',
      isbn: '9780593135204',
      ext: '.epub',
    },
  },
  {
    label: 'No metadata',
    vars: {
      author: 'Unknown Author',
      title: 'garbage_filename',
      series: '',
      number: '',
      year: '',
      isbn: '',
      ext: '.pdf',
    },
  },
];

export function OrganizeTab({ settings }: OrganizeTabProps) {
  const router = useRouter();
  const [template, setTemplate] = useState(settings.template);
  const [autoRun, setAutoRun] = useState(settings.autoRun);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const previews = useMemo(
    () =>
      SAMPLES.map((s) => {
        try {
          return { label: s.label, output: applyTemplate(template, s.vars) };
        } catch (err) {
          return {
            label: s.label,
            output: err instanceof Error ? err.message : 'Error',
          };
        }
      }),
    [template],
  );

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSaved(false);
    const result = await setOrganizeSettings(template, autoRun);
    if ('error' in result) {
      setError(result.error);
    } else {
      setSaved(true);
      router.refresh();
    }
    setSaving(false);
  };

  return (
    <div className="max-w-2xl">
      <p className="text-shelvarr-text-muted mb-6">
        Configure how your library files are renamed and organized.
      </p>

      <form onSubmit={handleSave} className="space-y-4">
        <div>
          <label
            htmlFor="organize-template"
            className="block text-sm font-medium text-shelvarr-text-muted mb-1"
          >
            Filename template
          </label>
          <input
            type="text"
            id="organize-template"
            value={template}
            onChange={(e) => setTemplate(e.target.value)}
            placeholder={DEFAULT_ORGANIZE_TEMPLATE}
            className="w-full bg-shelvarr-surface border border-shelvarr-border rounded-lg px-3 py-2 text-white font-mono text-sm placeholder-shelvarr-text-muted focus:outline-none focus:border-blue-500"
          />
          <button
            type="button"
            onClick={() => setTemplate(DEFAULT_ORGANIZE_TEMPLATE)}
            className="mt-1 text-xs text-blue-400 hover:text-blue-300"
          >
            Reset to default
          </button>
        </div>

        <div>
          <label className="flex items-center gap-2 text-sm text-white">
            <input
              type="checkbox"
              checked={autoRun}
              onChange={(e) => setAutoRun(e.target.checked)}
              className="rounded border-shelvarr-border"
            />
            Automatically organize after scan + metadata
          </label>
        </div>

        <div className="bg-shelvarr-surface border border-shelvarr-border rounded-lg p-4">
          <h3 className="text-sm font-medium text-white mb-2">Placeholders</h3>
          <ul className="text-xs text-shelvarr-text-muted space-y-1 font-mono">
            <li><code>{'{author}'}</code> — first author (defaults to &quot;Unknown Author&quot;)</li>
            <li><code>{'{title}'}</code> — book title (defaults to &quot;Untitled&quot;)</li>
            <li><code>{'{series}'}</code> — series name (empty for standalones)</li>
            <li><code>{'{number}'}</code> — zero-padded series number</li>
            <li><code>{'{year}'}</code> — 4-digit publication year</li>
            <li><code>{'{isbn}'}</code> — ISBN if available</li>
            <li><code>{'{ext}'}</code> — file extension without the dot</li>
          </ul>
        </div>

        <div className="bg-shelvarr-surface border border-shelvarr-border rounded-lg p-4">
          <h3 className="text-sm font-medium text-white mb-2">Preview</h3>
          <ul className="space-y-2">
            {previews.map((p) => (
              <li key={p.label}>
                <div className="text-xs text-shelvarr-text-muted">{p.label}</div>
                <div className="text-sm font-mono text-white break-all">{p.output}</div>
              </li>
            ))}
          </ul>
        </div>

        {error && (
          <div className="p-3 rounded-lg bg-red-600/20 text-red-400">
            {error}
          </div>
        )}
        {saved && !error && (
          <div className="p-3 rounded-lg bg-green-600/20 text-green-400">
            Settings saved.
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
        </div>
      </form>
    </div>
  );
}
