'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

interface MarkIssueReadButtonProps {
  issueId: number;
  total?: number | null;
}

export function MarkIssueReadButton({ issueId, total }: MarkIssueReadButtonProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const handleClick = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/comics/issues/${issueId}/progress`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ completed: true, ...(total ? { total } : {}) }),
      });
      if (res.ok) {
        router.refresh();
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      onClick={handleClick}
      disabled={loading}
      className="bg-shelvarr-bg hover:bg-shelvarr-border text-shelvarr-text-muted hover:text-white px-2 py-1 rounded transition-colors disabled:opacity-50"
    >
      {loading ? '…' : 'Mark read'}
    </button>
  );
}
