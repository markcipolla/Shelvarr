'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { cleanupTasks } from '@/lib/actions/tasks';
import { useToast } from '@/components/ui/Toast';

export function CleanupButton() {
  const router = useRouter();
  const toast = useToast();
  const [loading, setLoading] = useState(false);

  const handleCleanup = async () => {
    if (!confirm('Remove completed and failed tasks older than 7 days?')) {
      return;
    }

    setLoading(true);
    const result = await cleanupTasks(7);
    setLoading(false);

    if (result.success) {
      toast.success(`Cleaned up ${result.deleted} old tasks`);
      router.refresh();
    }
  };

  return (
    <button
      onClick={handleCleanup}
      disabled={loading}
      className="bg-shelvarr-surface hover:bg-shelvarr-border text-white border border-shelvarr-border px-4 py-2 rounded-lg font-medium transition-colors disabled:opacity-50"
    >
      {loading ? 'Cleaning...' : 'Cleanup Old Tasks'}
    </button>
  );
}
