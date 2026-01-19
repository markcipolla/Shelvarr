'use client';

import { useState, useMemo } from 'react';
import type { Task } from '@/lib/services/queue';
import { TaskList } from './TaskList';

interface TaskTabsProps {
  queuedTasks: Task[];
  completedTasks: Task[];
  queuedTotal: number;
  completedTotal: number;
}

// Extract retry queue position from error message like "Rate limited - queued for retry (#6)"
function getRetryQueuePosition(task: Task): number | null {
  if (!task.error) return null;
  const match = task.error.match(/queued for retry \(#(\d+)\)/);
  return match ? parseInt(match[1], 10) : null;
}

export function TaskTabs({ queuedTasks, completedTasks, queuedTotal, completedTotal }: TaskTabsProps) {
  const [activeTab, setActiveTab] = useState<'queued' | 'completed'>('queued');

  // Sort queued tasks: running first, then by retry queue position, then by created date
  const sortedQueuedTasks = useMemo(() => {
    return [...queuedTasks].sort((a, b) => {
      // Running tasks come first
      if (a.status === 'running' && b.status !== 'running') return -1;
      if (b.status === 'running' && a.status !== 'running') return 1;

      // Then sort by retry queue position (lower number = higher priority)
      const posA = getRetryQueuePosition(a);
      const posB = getRetryQueuePosition(b);

      if (posA !== null && posB !== null) {
        return posA - posB;
      }
      // Tasks with queue position come before those without
      if (posA !== null) return -1;
      if (posB !== null) return 1;

      // Finally sort by created date (newest first for non-retry tasks)
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
  }, [queuedTasks]);

  return (
    <div>
      <div className="flex border-b border-shelvarr-border mb-4">
        <button
          onClick={() => setActiveTab('queued')}
          className={`px-4 py-2 text-sm font-medium transition-colors relative ${
            activeTab === 'queued'
              ? 'text-white'
              : 'text-shelvarr-text-muted hover:text-white'
          }`}
        >
          Queued
          {queuedTotal > 0 && (
            <span className="ml-2 px-1.5 py-0.5 text-xs bg-blue-600 text-white rounded-full">
              {queuedTotal}
            </span>
          )}
          {activeTab === 'queued' && (
            <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-shelvarr-primary" />
          )}
        </button>
        <button
          onClick={() => setActiveTab('completed')}
          className={`px-4 py-2 text-sm font-medium transition-colors relative ${
            activeTab === 'completed'
              ? 'text-white'
              : 'text-shelvarr-text-muted hover:text-white'
          }`}
        >
          Completed
          {completedTotal > 0 && (
            <span className="ml-2 px-1.5 py-0.5 text-xs bg-shelvarr-text-muted/30 text-shelvarr-text-muted rounded-full">
              {completedTotal}
            </span>
          )}
          {activeTab === 'completed' && (
            <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-shelvarr-primary" />
          )}
        </button>
      </div>

      {activeTab === 'queued' && (
        <>
          {sortedQueuedTasks.length === 0 ? (
            <div className="bg-shelvarr-surface border border-shelvarr-border rounded-lg p-8 text-center">
              <p className="text-shelvarr-text-muted">
                No tasks in queue
              </p>
            </div>
          ) : (
            <>
              <div className="text-sm text-shelvarr-text-muted mb-3">
                {sortedQueuedTasks.length} task{sortedQueuedTasks.length !== 1 ? 's' : ''} in queue
              </div>
              <TaskList tasks={sortedQueuedTasks} />
            </>
          )}
        </>
      )}

      {activeTab === 'completed' && (
        <>
          {completedTasks.length === 0 ? (
            <div className="bg-shelvarr-surface border border-shelvarr-border rounded-lg p-8 text-center">
              <p className="text-shelvarr-text-muted">
                No completed tasks
              </p>
            </div>
          ) : (
            <>
              <div className="text-sm text-shelvarr-text-muted mb-3">
                Showing {completedTasks.length} of {completedTotal} completed tasks
              </div>
              <TaskList tasks={completedTasks} />
            </>
          )}
        </>
      )}
    </div>
  );
}
