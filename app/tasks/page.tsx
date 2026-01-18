import { getTasks } from '@/lib/actions/tasks';
import { TaskList } from '@/components/tasks/TaskList';
import { CleanupButton } from '@/components/tasks/CleanupButton';

export const dynamic = 'force-dynamic';

export default async function TasksPage() {
  const { tasks, total } = await getTasks({ limit: 50 });

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

      <div className="text-sm text-shelvarr-text-muted">
        Showing {tasks.length} of {total} tasks
      </div>

      {tasks.length === 0 ? (
        <div className="bg-shelvarr-surface border border-shelvarr-border rounded-lg p-8 text-center">
          <p className="text-shelvarr-text-muted">
            No tasks yet. Tasks are created when you scan libraries or fetch metadata.
          </p>
        </div>
      ) : (
        <TaskList tasks={tasks} />
      )}
    </div>
  );
}
