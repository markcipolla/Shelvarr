'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { createLibrary } from '@/lib/actions/libraries';
import { isHardcoverConfigured } from '@/lib/actions/settings';
import { FolderPicker } from '@/components/ui/FolderPicker';

export function AddLibraryButton() {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pathValue, setPathValue] = useState('');
  const [isConfigured, setIsConfigured] = useState<boolean | null>(null);

  // Check if Hardcover is configured when modal opens
  useEffect(() => {
    if (open) {
      isHardcoverConfigured().then(setIsConfigured);
    }
  }, [open]);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const formData = new FormData(e.currentTarget);
    const result = await createLibrary(formData);

    setLoading(false);

    if (result.error) {
      setError(result.error);
    } else {
      setOpen(false);
      setPathValue('');
    }
  };

  const handleClose = () => {
    setOpen(false);
    setPathValue('');
    setError(null);
  };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium transition-colors"
      >
        Add Library
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="fixed inset-0 bg-black/50" onClick={handleClose} />

          <div className="relative bg-shelvarr-surface border border-shelvarr-border rounded-lg p-6 w-full max-w-md z-50">
            <h2 className="text-xl font-semibold text-white mb-4">Add Library</h2>

            {isConfigured === false && (
              <div className="mb-4 p-4 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
                <div className="flex items-start gap-3">
                  <svg className="w-5 h-5 text-yellow-500 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                  <div>
                    <p className="text-yellow-500 font-medium text-sm">Hardcover API key not configured</p>
                    <p className="text-xs text-shelvarr-text-muted mt-1">
                      Metadata won&apos;t be fetched automatically. Add your API key in{' '}
                      <Link href="/settings" className="text-blue-400 hover:text-blue-300" onClick={handleClose}>
                        Settings
                      </Link>
                      .
                    </p>
                  </div>
                </div>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label htmlFor="name" className="block text-sm font-medium text-shelvarr-text-muted mb-1">
                  Name
                </label>
                <input
                  type="text"
                  id="name"
                  name="name"
                  required
                  placeholder="My Books"
                  className="w-full bg-shelvarr-bg border border-shelvarr-border rounded-lg px-3 py-2 text-white placeholder-shelvarr-text-muted focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label htmlFor="path" className="block text-sm font-medium text-shelvarr-text-muted mb-1">
                  Path
                </label>
                <FolderPicker
                  id="path"
                  name="path"
                  required
                  placeholder="/libraries/ebooks"
                  value={pathValue}
                  onChange={setPathValue}
                  inputClassName="flex-1 min-w-0 bg-shelvarr-bg border border-shelvarr-border rounded-lg px-3 py-2 text-white placeholder-shelvarr-text-muted focus:outline-none focus:border-blue-500"
                />
              </div>

              {error && (
                <div className="text-red-400 text-sm">{error}</div>
              )}

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={handleClose}
                  className="px-4 py-2 text-shelvarr-text-muted hover:text-white transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium transition-colors disabled:opacity-50"
                >
                  {loading ? 'Creating...' : 'Add Library'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}

