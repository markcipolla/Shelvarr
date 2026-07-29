'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  setKokoroSettings,
  testKokoroConnection,
  previewKokoroVoice,
} from '@/lib/actions/settings';

interface KokoroSettings {
  url: string;
  voice: string;
  model: string;
  speed: number;
  fromEnv: boolean;
}

interface KokoroTabProps {
  settings: KokoroSettings;
}

export function KokoroTab({ settings }: KokoroTabProps) {
  const router = useRouter();
  const [url, setUrl] = useState(settings.url);
  const [voice, setVoice] = useState(settings.voice);
  const [model, setModel] = useState(settings.model);
  const [speed, setSpeed] = useState(String(settings.speed));
  const [voices, setVoices] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [hasPreview, setHasPreview] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<
    { success: boolean; error?: string; count?: number } | null
  >(null);
  const audioRef = useRef<HTMLAudioElement>(null);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSaveError(null);

    const result = await setKokoroSettings({
      url,
      voice,
      model,
      speed: parseFloat(speed),
    });

    if (result && 'error' in result && result.error) {
      setSaveError(result.error);
    } else {
      router.refresh();
    }
    setSaving(false);
  };

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);

    const result = await testKokoroConnection(url);
    if (result.success && result.voices) {
      setVoices(result.voices);
      // Fall back to the first offered voice if the saved one is unavailable.
      if (result.voices.length > 0 && !result.voices.includes(voice)) {
        setVoice(result.voices[0]!);
      }
      setTestResult({ success: true, count: result.voices.length });
    } else {
      setTestResult({ success: false, error: result.error });
    }
    setTesting(false);
  };

  const handlePreview = async () => {
    setPreviewing(true);
    const result = await previewKokoroVoice({
      url,
      voice,
      model,
      speed: parseFloat(speed) || 1,
    });

    if ('audio' in result && result.audio && audioRef.current) {
      audioRef.current.src = result.audio;
      setHasPreview(true);
      audioRef.current.play().catch(() => {});
    } else if ('error' in result) {
      setTestResult({ success: false, error: result.error });
    }
    setPreviewing(false);
  };

  return (
    <div className="max-w-xl">
      <p className="text-shelvarr-text-muted mb-6">
        Connect a{' '}
        <a
          href="https://github.com/remsky/kokoro-fastapi"
          target="_blank"
          rel="noreferrer"
          className="text-blue-400 hover:underline"
        >
          kokoro-fastapi
        </a>{' '}
        server to narrate EPUBs into audiobooks.
      </p>

      <form onSubmit={handleSave} className="space-y-4">
        <div>
          <label
            htmlFor="kokoro-url"
            className="block text-sm font-medium text-shelvarr-text-muted mb-1"
          >
            Kokoro URL
          </label>
          <input
            type="url"
            id="kokoro-url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="http://localhost:8880"
            className="w-full bg-shelvarr-surface border border-shelvarr-border rounded-lg px-3 py-2 text-white placeholder-shelvarr-text-muted focus:outline-none focus:border-blue-500"
          />
          {settings.fromEnv && (
            <p className="mt-1 text-xs text-shelvarr-text-muted">
              Currently set by the KOKORO_URL environment variable. Saving here overrides it.
            </p>
          )}
        </div>

        <div>
          <label
            htmlFor="kokoro-voice"
            className="block text-sm font-medium text-shelvarr-text-muted mb-1"
          >
            Voice
          </label>
          {voices.length > 0 ? (
            <select
              id="kokoro-voice"
              value={voice}
              onChange={(e) => setVoice(e.target.value)}
              className="w-full bg-shelvarr-surface border border-shelvarr-border rounded-lg px-3 py-2 text-white focus:outline-none focus:border-blue-500"
            >
              {voices.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          ) : (
            <>
              <input
                type="text"
                id="kokoro-voice"
                value={voice}
                onChange={(e) => setVoice(e.target.value)}
                placeholder="af_bella"
                className="w-full bg-shelvarr-surface border border-shelvarr-border rounded-lg px-3 py-2 text-white placeholder-shelvarr-text-muted focus:outline-none focus:border-blue-500"
              />
              <p className="mt-1 text-xs text-shelvarr-text-muted">
                Test the connection to load the voices your server offers.
              </p>
            </>
          )}
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label
              htmlFor="kokoro-model"
              className="block text-sm font-medium text-shelvarr-text-muted mb-1"
            >
              Model
            </label>
            <input
              type="text"
              id="kokoro-model"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder="kokoro"
              className="w-full bg-shelvarr-surface border border-shelvarr-border rounded-lg px-3 py-2 text-white placeholder-shelvarr-text-muted focus:outline-none focus:border-blue-500"
            />
          </div>

          <div>
            <label
              htmlFor="kokoro-speed"
              className="block text-sm font-medium text-shelvarr-text-muted mb-1"
            >
              Speed
            </label>
            <input
              type="number"
              id="kokoro-speed"
              min="0.5"
              max="2"
              step="0.05"
              value={speed}
              onChange={(e) => setSpeed(e.target.value)}
              className="w-full bg-shelvarr-surface border border-shelvarr-border rounded-lg px-3 py-2 text-white focus:outline-none focus:border-blue-500"
            />
          </div>
        </div>

        {saveError && (
          <div className="p-3 rounded-lg bg-red-600/20 text-red-400">{saveError}</div>
        )}

        {testResult && (
          <div
            className={`p-3 rounded-lg ${
              testResult.success
                ? 'bg-green-600/20 text-green-400'
                : 'bg-red-600/20 text-red-400'
            }`}
          >
            {testResult.success
              ? `Connected — ${testResult.count} voices available`
              : `Connection failed: ${testResult.error}`}
          </div>
        )}

        {/* Holds the generated sample; only shown once a preview has been made. */}
        <audio ref={audioRef} className={hasPreview ? 'w-full' : 'hidden'} controls />

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

          <button
            type="button"
            onClick={handlePreview}
            disabled={previewing || !url || !voice}
            className="bg-shelvarr-surface hover:bg-shelvarr-border text-white border border-shelvarr-border px-4 py-2 rounded-lg font-medium transition-colors disabled:opacity-50"
          >
            {previewing ? 'Generating...' : 'Preview voice'}
          </button>
        </div>
      </form>
    </div>
  );
}
