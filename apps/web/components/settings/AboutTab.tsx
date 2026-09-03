import {
  APP_VERSION,
  APP_NAME,
  BUILD_VERSION,
  FRAMEWORK,
  REPOSITORY_URL,
} from '@/lib/constants';

export function AboutTab() {
  return (
    <div className="max-w-xl space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-white mb-2">{APP_NAME}</h2>
        <p className="text-shelvarr-text-muted">
          Self-hosted book and comic metadata management application.
        </p>
      </div>

      <div className="bg-shelvarr-surface border border-shelvarr-border rounded-lg p-4 space-y-3">
        <div className="flex justify-between">
          <span className="text-shelvarr-text-muted">Version</span>
          <span className="text-white">{APP_VERSION}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-shelvarr-text-muted">Build</span>
          <span className="text-white font-mono">{BUILD_VERSION}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-shelvarr-text-muted">Framework</span>
          <span className="text-white">{FRAMEWORK}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-shelvarr-text-muted">Database</span>
          <span className="text-white">SQLite</span>
        </div>
      </div>

      <div>
        <h3 className="text-md font-semibold text-white mb-2">Links</h3>
        <div className="space-y-2">
          <a
            href={REPOSITORY_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="block text-blue-400 hover:text-blue-300 transition-colors"
          >
            GitHub Repository
          </a>
          <a
            href={`${REPOSITORY_URL}/issues`}
            target="_blank"
            rel="noopener noreferrer"
            className="block text-blue-400 hover:text-blue-300 transition-colors"
          >
            Report an Issue
          </a>
        </div>
      </div>
    </div>
  );
}
