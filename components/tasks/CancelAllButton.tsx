'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { cancelAllQueuedTasks } from '@/lib/actions/tasks';
import { useToast } from '@/components/ui/Toast';

interface CancelAllButtonProps {
  queuedCount: number;
}

export function CancelAllButton({ queuedCount }: CancelAllButtonProps) {
  const router = useRouter();
  const toast = useToast();
  const [loading, setLoading] = useState(false);

  if (queuedCount === 0) {
    return null;
  }

  const handleCancelAll = async () => {
    if (!confirm(`Cancel all ${queuedCount} queued task${queuedCount === 1 ? '' : 's'}?`)) {
      return;
    }

    setLoading(true);
    const result = await cancelAllQueuedTasks();
    setLoading(false);

    if (result.success) {
      toast.success(`Cancelled ${result.cancelled} task${result.cancelled === 1 ? '' : 's'}`);
      router.refresh();
    }
  };

  return (
    <button
      onClick={handleCancelAll}
      disabled={loading}
      className="bg-red-600/20 hover:bg-red-600/30 text-red-400 border border-red-600/30 px-4 py-2 rounded-lg font-medium transition-colors disabled:opacity-50"
    >
      {loading ? 'Cancelling...' : 'Cancel All Queued'}
    </button>
  );
}
