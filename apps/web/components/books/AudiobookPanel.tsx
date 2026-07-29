'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useToast } from '@/components/ui/Toast';

interface AudiobookPanelProps {
  bookId: number;
}

interface AudiobookTrack {
  file: string;
  title: string;
  chars: number;
}

interface AudiobookStatus {
  configured: boolean;
  supported: boolean;
  generated: boolean;
  generatedAt: string | null;
  voice: string | null;
  tracks: AudiobookTrack[];
  task: { id: number; status: string; progress: number; total: number | null } | null;
}

/** How often to re-check progress while a generation task is in flight. */
const POLL_INTERVAL_MS = 3000;

export function AudiobookPanel({ bookId }: AudiobookPanelProps) {
  const toast = useToast();
  const [status, setStatus] = useState<AudiobookStatus | null>(null);
  const [starting, setStarting] = useState(false);
  const [playing, setPlaying] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(`/api/books/${bookId}/audiobook`);
      if (res.ok) setStatus(await res.json());
    } catch {
      // Transient failures just mean the next poll picks it up.
    }
  }, [bookId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Poll only while a task is running, so an idle page is quiet.
  const isRunning = !!status?.task;
  useEffect(() => {
    if (!isRunning) return;
    const timer = setInterval(refresh, POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [isRunning, refresh]);

  const handleGenerate = async () => {
    setStarting(true);
    try {
      const res = await fetch(`/api/books/${bookId}/audiobook`, { method: 'POST' });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        toast.error(data?.error || 'Failed to start audiobook generation');
      } else {
        toast.success('Audiobook generation queued');
        refresh();
      }
    } catch {
      toast.error('Failed to reach server');
    } finally {
      setStarting(false);
    }
  };

  const handlePlay = (file: string) => {
    setPlaying(file);
    // Let the new src land before asking the element to play it.
    requestAnimationFrame(() => audioRef.current?.play().catch(() => {}));
  };

  if (!status || !status.supported) return null;

  const task = status.task;
  const percent =
    task && task.total ? Math.round((task.progress / task.total) * 100) : null;

  return (
    <div className="pt-2 border-t border-shelvarr-border">
      <div className="flex items-center justify-between mb-2">
        <label className="block text-sm text-shelvarr-text-muted">Audiobook</label>
        {status.generated && status.voice && (
          <span className="text-xs text-shelvarr-text-muted">{status.voice}</span>
        )}
      </div>

      {!status.configured && (
        <p className="text-xs text-shelvarr-text-muted mb-2">
          <a href="/settings/narration" className="text-blue-400 hover:underline">
            Configure a Kokoro server
          </a>{' '}
          to enable narration.
        </p>
      )}

      {task ? (
        <div className="space-y-1">
          <div className="h-2 bg-shelvarr-bg rounded-full overflow-hidden">
            <div
              className="h-full bg-pink-500 transition-all"
              style={{ width: `${percent ?? 0}%` }}
            />
          </div>
          <p className="text-xs text-shelvarr-text-muted">
            {task.status === 'pending'
              ? 'Queued…'
              : `Narrating… ${percent ?? 0}% (${task.progress}/${task.total ?? '?'})`}
          </p>
        </div>
      ) : (
        <button
          onClick={handleGenerate}
          disabled={starting || !status.configured}
          className="w-full bg-shelvarr-surface hover:bg-shelvarr-border border border-shelvarr-border text-shelvarr-text px-4 py-2 rounded-lg font-medium transition-colors disabled:opacity-50"
        >
          {starting
            ? 'Starting…'
            : status.generated
              ? 'Regenerate audiobook'
              : 'Generate audiobook'}
        </button>
      )}

      {status.tracks.length > 0 && (
        <>
          <ul className="mt-3 space-y-1 max-h-64 overflow-y-auto">
            {status.tracks.map((track, index) => (
              <li key={track.file}>
                <button
                  onClick={() => handlePlay(track.file)}
                  className={`w-full text-left text-sm px-2 py-1 rounded transition-colors ${
                    playing === track.file
                      ? 'bg-pink-600/20 text-pink-300'
                      : 'text-shelvarr-text hover:bg-shelvarr-surface'
                  }`}
                >
                  <span className="text-shelvarr-text-muted mr-2">{index + 1}.</span>
                  {track.title}
                </button>
              </li>
            ))}
          </ul>

          {playing && (
            <audio
              ref={audioRef}
              controls
              className="w-full mt-2"
              src={`/api/books/${bookId}/audiobook/${encodeURIComponent(playing)}`}
            />
          )}
        </>
      )}
    </div>
  );
}
