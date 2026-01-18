'use client';

import { useState } from 'react';
import { createLibrary } from '@/lib/actions/libraries';
import { FolderBrowser } from './FolderBrowser';

export function AddLibraryButton() {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showBrowser, setShowBrowser] = useState(false);
  const [pathValue, setPathValue] = useState('');

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
      setShowBrowser(false);
    }
  };

  const handleSelectPath = (path: string) => {
    setPathValue(path);
    setShowBrowser(false);
  };

  const handleClose = () => {
    setOpen(false);
    setPathValue('');
    setShowBrowser(false);
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
                <div className="flex gap-2">
                  <input
                    type="text"
                    id="path"
                    name="path"
                    required
                    placeholder="/libraries/ebooks"
                    value={pathValue}
                    onChange={(e) => setPathValue(e.target.value)}
                    className="flex-1 bg-shelvarr-bg border border-shelvarr-border rounded-lg px-3 py-2 text-white placeholder-shelvarr-text-muted focus:outline-none focus:border-blue-500"
                  />
                  <button
                    type="button"
                    onClick={() => setShowBrowser(!showBrowser)}
                    className="bg-shelvarr-bg hover:bg-shelvarr-border text-white border border-shelvarr-border px-3 py-2 rounded-lg transition-colors flex items-center gap-2"
                  >
                    <FolderIcon />
                    Browse
                  </button>
                </div>
                {showBrowser && (
                  <FolderBrowser
                    onSelect={handleSelectPath}
                    onClose={() => setShowBrowser(false)}
                  />
                )}
              </div>

              <div>
                <label htmlFor="type" className="block text-sm font-medium text-shelvarr-text-muted mb-1">
                  Type
                </label>
                <select
                  id="type"
                  name="type"
                  defaultValue="book"
                  className="w-full bg-shelvarr-bg border border-shelvarr-border rounded-lg px-3 py-2 text-white focus:outline-none focus:border-blue-500"
                >
                  <option value="book">Books</option>
                  <option value="comic">Comics</option>
                </select>
                <p className="mt-1 text-xs text-shelvarr-text-muted">
                  Affects which metadata sources are used
                </p>
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

function FolderIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"
      />
    </svg>
  );
}
