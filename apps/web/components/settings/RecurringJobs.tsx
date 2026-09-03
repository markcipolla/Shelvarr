'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  runScheduleNowAction,
  setScheduleEnabledAction,
  setScheduleIntervalAction,
  type ScheduleView,
} from '@/lib/actions/settings';

/** Interval choices offered in the UI, in seconds. */
const INTERVAL_CHOICES: Array<{ label: string; seconds: number }> = [
  { label: 'Every 6 hours', seconds: 6 * 3600 },
  { label: 'Every 12 hours', seconds: 12 * 3600 },
  { label: 'Daily', seconds: 24 * 3600 },
  { label: 'Every 3 days', seconds: 3 * 24 * 3600 },
  { label: 'Weekly', seconds: 7 * 24 * 3600 },
];

function formatWhen(unixSeconds: number | null): string {
  if (!unixSeconds) return 'never';
  return new Date(unixSeconds * 1000).toLocaleString();
}

/**
 * The recurring-job list shared by the Books and Comics settings tabs. Each
 * tab passes the jobs in its own category and a line explaining them.
 */
export function RecurringJobs({
  schedules,
  blurb,
}: {
  schedules: ScheduleView[];
  blurb: string;
}) {
  const router = useRouter();
  const [busySchedule, setBusySchedule] = useState<string | null>(null);
  const [scheduleMessage, setScheduleMessage] = useState<string | null>(null);

  const handleToggle = async (name: string, enabled: boolean) => {
    setBusySchedule(name);
    setScheduleMessage(null);
    await setScheduleEnabledAction(name, enabled);
    router.refresh();
    setBusySchedule(null);
  };

  const handleInterval = async (name: string, seconds: number) => {
    setBusySchedule(name);
    setScheduleMessage(null);
    await setScheduleIntervalAction(name, seconds);
    router.refresh();
    setBusySchedule(null);
  };

  const handleRunNow = async (name: string) => {
    setBusySchedule(name);
    const result = await runScheduleNowAction(name);
    setScheduleMessage(
      result.success
        ? `Started — follow task ${result.taskId} on the Tasks page.`
        : result.error ?? 'Could not start the job'
    );
    router.refresh();
    setBusySchedule(null);
  };

  return (
    <section>
      <h2 className="text-lg font-semibold text-white mb-1">Recurring jobs</h2>
      <p className="text-shelvarr-text-muted mb-4 text-sm">{blurb}</p>

      <ul className="space-y-3">
        {schedules.map((schedule) => (
          <li
            key={schedule.name}
            className="bg-shelvarr-surface border border-shelvarr-border rounded-lg px-4 py-3"
          >
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="text-white text-sm">{schedule.description || schedule.name}</p>
                <p className="text-xs text-shelvarr-text-muted mt-1">
                  Last run {formatWhen(schedule.lastRun)}
                  {schedule.enabled && ` · next ${formatWhen(schedule.nextRun)}`}
                </p>
              </div>

              <label className="flex items-center gap-2 text-sm text-shelvarr-text-muted whitespace-nowrap">
                <input
                  type="checkbox"
                  checked={schedule.enabled}
                  disabled={busySchedule === schedule.name}
                  onChange={(event) => handleToggle(schedule.name, event.target.checked)}
                />
                Enabled
              </label>
            </div>

            <div className="flex items-center gap-2 mt-3">
              <select
                value={schedule.intervalSeconds}
                disabled={busySchedule === schedule.name}
                onChange={(event) => handleInterval(schedule.name, Number(event.target.value))}
                className="bg-shelvarr-bg border border-shelvarr-border rounded-lg px-2 py-1 text-sm text-white"
              >
                {INTERVAL_CHOICES.some(
                  (choice) => choice.seconds === schedule.intervalSeconds
                ) ? null : (
                  <option value={schedule.intervalSeconds}>
                    Every {Math.round(schedule.intervalSeconds / 3600)} hours
                  </option>
                )}
                {INTERVAL_CHOICES.map((choice) => (
                  <option key={choice.seconds} value={choice.seconds}>
                    {choice.label}
                  </option>
                ))}
              </select>

              <button
                type="button"
                onClick={() => handleRunNow(schedule.name)}
                disabled={busySchedule === schedule.name}
                className="px-3 py-1 text-sm rounded-lg border border-shelvarr-border text-white hover:border-blue-500 disabled:opacity-50"
              >
                Run now
              </button>
            </div>
          </li>
        ))}
      </ul>

      {scheduleMessage && (
        <p className="mt-3 text-sm text-shelvarr-text-muted">{scheduleMessage}</p>
      )}
    </section>
  );
}
