import Link from 'next/link';
import { getAllLibraries, getLibraryBookCount } from '@/lib/services/library';
import { getRecentTasks, getTaskStats } from '@/lib/services/queue';

export const dynamic = 'force-dynamic';

async function getStats() {
  const libraries = await getAllLibraries();
  let totalBooks = 0;

  for (const lib of libraries) {
    totalBooks += await getLibraryBookCount(lib.id);
  }

  const taskStats = await getTaskStats();
  const recentTasks = await getRecentTasks(5);

  return {
    libraryCount: libraries.length,
    bookCount: totalBooks,
    taskStats,
    recentTasks,
  };
}

export default async function DashboardPage() {
  const stats = await getStats();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">Dashboard</h1>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Link
          href="/libraries"
          className="bg-shelvarr-surface border border-shelvarr-border rounded-lg p-4 hover:border-shelvarr-primary transition-colors"
        >
          <div className="text-shelvarr-text-muted text-sm">Libraries</div>
          <div className="text-3xl font-bold text-white mt-1">{stats.libraryCount}</div>
        </Link>

        <Link
          href="/books"
          className="bg-shelvarr-surface border border-shelvarr-border rounded-lg p-4 hover:border-shelvarr-primary transition-colors"
        >
          <div className="text-shelvarr-text-muted text-sm">Books</div>
          <div className="text-3xl font-bold text-white mt-1">{stats.bookCount}</div>
        </Link>

        <Link
          href="/tasks"
          className="bg-shelvarr-surface border border-shelvarr-border rounded-lg p-4 hover:border-shelvarr-primary transition-colors"
        >
          <div className="text-shelvarr-text-muted text-sm">Running Tasks</div>
          <div className="text-3xl font-bold text-white mt-1">{stats.taskStats.running}</div>
        </Link>

        <div className="bg-shelvarr-surface border border-shelvarr-border rounded-lg p-4">
          <div className="text-shelvarr-text-muted text-sm">Completed Tasks</div>
          <div className="text-3xl font-bold text-white mt-1">{stats.taskStats.completed}</div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="bg-shelvarr-surface border border-shelvarr-border rounded-lg p-4">
        <h2 className="text-lg font-semibold text-white mb-4">Quick Actions</h2>
        <div className="flex flex-wrap gap-3">
          <Link
            href="/libraries"
            className="bg-shelvarr-primary hover:bg-blue-600 text-white px-4 py-2 rounded-lg font-medium transition-colors"
          >
            Add Library
          </Link>
          <Link
            href="/books"
            className="bg-shelvarr-surface hover:bg-shelvarr-border text-shelvarr-text border border-shelvarr-border px-4 py-2 rounded-lg font-medium transition-colors"
          >
            Browse Books
          </Link>
        </div>
      </div>

      {/* Recent Activity */}
      <div className="bg-shelvarr-surface border border-shelvarr-border rounded-lg p-4">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-white">Recent Activity</h2>
          <Link href="/tasks" className="text-sm text-shelvarr-primary hover:underline">
            View All
          </Link>
        </div>

        {stats.recentTasks.length === 0 ? (
          <p className="text-shelvarr-text-muted">No recent activity</p>
        ) : (
          <div className="space-y-2">
            {stats.recentTasks.map((task) => (
              <div
                key={task.id}
                className="flex items-center justify-between py-2 border-b border-shelvarr-border last:border-0"
              >
                <div>
                  <span className="text-white">{task.type}</span>
                  <span className="text-shelvarr-text-muted ml-2 text-sm">
                    {task.status}
                  </span>
                </div>
                <span className="text-shelvarr-text-muted text-sm">
                  {new Date(task.createdAt).toLocaleString()}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
