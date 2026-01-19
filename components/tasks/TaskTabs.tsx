'use client';

import { useState } from 'react';
import type { Task } from '@/lib/services/queue';
import { TaskList } from './TaskList';

interface TaskTabsProps {
  queuedTasks: Task[];
  completedTasks: Task[];
  queuedTotal: number;
  completedTotal: number;
}

export function TaskTabs({ queuedTasks, completedTasks, queuedTotal, completedTotal }: TaskTabsProps) {
  const [activeTab, setActiveTab] = useState<'queued' | 'completed'>('queued');

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
          {queuedTasks.length === 0 ? (
            <div className="bg-shelvarr-surface border border-shelvarr-border rounded-lg p-8 text-center">
              <p className="text-shelvarr-text-muted">
                No tasks in queue
              </p>
            </div>
          ) : (
            <>
              <div className="text-sm text-shelvarr-text-muted mb-3">
                {queuedTasks.length} task{queuedTasks.length !== 1 ? 's' : ''} in queue
              </div>
              <TaskList tasks={queuedTasks} />
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
