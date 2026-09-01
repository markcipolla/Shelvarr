'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Task } from '@/lib/services/queue';
import { cancelTask, retryTask } from '@/lib/actions/tasks';

interface TaskListProps {
  tasks: Task[];
}

export function TaskList({ tasks }: TaskListProps) {
  return (
    <div className="bg-shelvarr-surface border border-shelvarr-border rounded-lg divide-y divide-shelvarr-border">
      {tasks.map((task) => (
        <TaskRow key={task.id} task={task} />
      ))}
    </div>
  );
}

function TaskRow({ task }: { task: Task }) {
  const router = useRouter();
  const [cancelling, setCancelling] = useState(false);
  const [retrying, setRetrying] = useState(false);

  const handleCancel = async () => {
    setCancelling(true);
    await cancelTask(task.id);
    router.refresh();
    setCancelling(false);
  };

  const handleRetry = async () => {
    setRetrying(true);
    await retryTask(task.id);
    router.refresh();
    setRetrying(false);
  };

  const statusColor = {
    pending: 'bg-yellow-600/20 text-yellow-400',
    running: 'bg-blue-600/20 text-blue-400',
    completed: 'bg-green-600/20 text-green-400',
    failed: 'bg-red-600/20 text-red-400',
    cancelled: 'bg-gray-600/20 text-gray-400',
  }[task.status];

  const typeLabel = {
    scan: 'Library Scan',
    metadata: 'Metadata Fetch',
    book_metadata: 'Book Metadata',
    organize: 'File Organization',
    download: 'Download',
    author_sync: 'Author Sync',
    komga_sync: 'Komga Sync',
    comic_search: 'Comic Search',
    comic_download: 'Comic Download',
    comic_refresh: 'Comic Metadata Refresh',
    comic_scan: 'Comic File Scan',
    comic_rename: 'Comic Rename',
    comic_update_all: 'Refresh All Comics',
    comic_search_all: 'Search All Comics',
    comic_resume: 'Resume Interrupted Downloads',
    comic_library_import: 'Comic Library Import',
    comic_adopt: 'Comic Library Migration',
  }[task.type] || task.type;

  const taskData = task.data || {};
  const organizeResult =
    task.type === 'organize' && task.status === 'completed'
      ? (taskData as unknown as OrganizeResult)
      : null;

  return (
    <div className="p-4 flex items-center justify-between">
      <div className="flex items-center gap-4">
        <TaskIcon type={task.type} />
        <div>
          <div className="font-medium text-white">{typeLabel}</div>
          <div className="text-sm text-shelvarr-text-muted">
            {taskData.libraryName ? (
              <span>Library: {String(taskData.libraryName)}</span>
            ) : null}
            {taskData.bookId ? (
              <span>Book ID: {String(taskData.bookId)}</span>
            ) : null}
          </div>
          {organizeResult && <OrganizeResultSummary result={organizeResult} />}
          <div className="text-xs text-shelvarr-text-muted mt-1">
            Created: {formatDate(task.createdAt)}
            {task.completedAt && ` • Completed: ${formatDate(task.completedAt)}`}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-4">
        {task.status === 'running' && task.total && task.total > 0 && (
          <div className="w-32">
            <div className="h-2 bg-shelvarr-bg rounded-full overflow-hidden">
              <div
                className="h-full bg-blue-600 transition-all"
                style={{ width: `${(task.progress / task.total) * 100}%` }}
              />
            </div>
            <div className="text-xs text-shelvarr-text-muted text-center mt-1">
              {task.progress} / {task.total}
            </div>
          </div>
        )}

        <span className={`px-2 py-1 rounded text-xs font-medium ${statusColor}`}>
          {task.status}
        </span>

        {(task.status === 'pending' || task.status === 'running') && (
          <button
            onClick={handleCancel}
            disabled={cancelling}
            className="text-red-400 hover:text-red-300 text-sm transition-colors disabled:opacity-50"
          >
            {cancelling ? 'Cancelling...' : 'Cancel'}
          </button>
        )}

        {(task.status === 'failed' || task.status === 'cancelled') && (
          <button
            onClick={handleRetry}
            disabled={retrying}
            className="text-blue-400 hover:text-blue-300 text-sm transition-colors disabled:opacity-50"
          >
            {retrying ? 'Retrying...' : 'Retry'}
          </button>
        )}

        {task.error && (
          <span
            className="text-red-400 text-sm max-w-xs truncate"
            title={task.error}
          >
            {task.error}
          </span>
        )}
      </div>
    </div>
  );
}

interface OrganizeResult {
  total?: number;
  organized?: number;
  skipped?: number;
  failed?: number;
  skippedReasons?: {
    libraryMissing?: number;
    noTitle?: number;
    alreadyAtTarget?: number;
    sourceMissing?: number;
  };
  removedMissing?: number;
  requeuedAsWanted?: number;
  errors?: string[];
  errorCount?: number;
}

function OrganizeResultSummary({ result }: { result: OrganizeResult }) {
  const [showDetails, setShowDetails] = useState(false);
  const reasons = result.skippedReasons;
  const errors = result.errors ?? [];
  const errorCount = result.errorCount ?? errors.length;
  const removedMissing = result.removedMissing ?? 0;
  const requeuedAsWanted = result.requeuedAsWanted ?? 0;
  const hasDetail = !!reasons || errors.length > 0 || removedMissing > 0;

  return (
    <div className="text-xs text-shelvarr-text-muted mt-1">
      <div>
        {result.organized ?? 0} moved · {result.skipped ?? 0} skipped ·{' '}
        {result.failed ?? 0} failed
        {removedMissing > 0 && (
          <>
            {' '}
            · {removedMissing} removed (missing file
            {requeuedAsWanted > 0 ? `, ${requeuedAsWanted} re-added to wanted` : ''})
          </>
        )}
        {hasDetail && (
          <button
            onClick={() => setShowDetails((v) => !v)}
            className="ml-2 text-blue-400 hover:text-blue-300"
          >
            {showDetails ? 'Hide details' : 'Show details'}
          </button>
        )}
      </div>
      {showDetails && (
        <div className="mt-2 p-2 bg-shelvarr-bg rounded space-y-2">
          {reasons && (
            <div>
              <div className="font-medium text-shelvarr-text mb-1">
                Skipped breakdown
              </div>
              <ul className="ml-2 space-y-0.5">
                <li>
                  Already at target location: {reasons.alreadyAtTarget ?? 0}
                </li>
                <li>
                  Source file not found on disk: {reasons.sourceMissing ?? 0}
                </li>
                <li>No title (needs metadata): {reasons.noTitle ?? 0}</li>
                <li>Library record missing: {reasons.libraryMissing ?? 0}</li>
              </ul>
            </div>
          )}
          {errors.length > 0 && (
            <div>
              <div className="font-medium text-shelvarr-text mb-1">
                Errors ({errorCount}
                {errorCount > errors.length ? `, showing first ${errors.length}` : ''})
              </div>
              <ul className="ml-2 space-y-0.5 max-h-60 overflow-y-auto font-mono text-[11px]">
                {errors.map((e, i) => (
                  <li key={i} className="text-red-300">
                    {e}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function TaskIcon({ type }: { type: string }) {
  switch (type) {
    case 'scan':
      return (
        <div className="w-10 h-10 bg-blue-600/20 rounded-lg flex items-center justify-center text-blue-400">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
        </div>
      );
    case 'metadata':
      return (
        <div className="w-10 h-10 bg-purple-600/20 rounded-lg flex items-center justify-center text-purple-400">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
          </svg>
        </div>
      );
    case 'organize':
      return (
        <div className="w-10 h-10 bg-green-600/20 rounded-lg flex items-center justify-center text-green-400">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
          </svg>
        </div>
      );
    case 'komga_sync':
      return (
        <div className="w-10 h-10 bg-orange-600/20 rounded-lg flex items-center justify-center text-orange-400">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
        </div>
      );
    default:
      return (
        <div className="w-10 h-10 bg-shelvarr-bg rounded-lg flex items-center justify-center text-shelvarr-text-muted">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
      );
  }
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diff = now.getTime() - date.getTime();

  if (diff < 60000) return 'Just now';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;

  return date.toLocaleDateString();
}
