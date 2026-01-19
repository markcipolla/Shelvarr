import { getTasks } from '@/lib/actions/tasks';
import { TaskTabs } from '@/components/tasks/TaskTabs';
import { CleanupButton } from '@/components/tasks/CleanupButton';

export const dynamic = 'force-dynamic';

export default async function TasksPage() {
  // Fetch queued (pending/running) and completed tasks separately
  const [queuedResult, completedResult] = await Promise.all([
    getTasks({ statuses: ['pending', 'running'], limit: 100 }),
    getTasks({ statuses: ['completed', 'failed', 'cancelled'], limit: 100 }),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Tasks</h1>
          <p className="text-shelvarr-text-muted mt-1">
            Background jobs and their status
          </p>
        </div>
        <CleanupButton />
      </div>

      <TaskTabs
        queuedTasks={queuedResult.tasks}
        completedTasks={completedResult.tasks}
        queuedTotal={queuedResult.total}
        completedTotal={completedResult.total}
      />
    </div>
  );
}
