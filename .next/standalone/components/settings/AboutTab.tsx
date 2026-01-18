export function AboutTab() {
  return (
    <div className="max-w-xl space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-white mb-2">Shelvarr</h2>
        <p className="text-shelvarr-text-muted">
          Self-hosted book and comic metadata management application.
        </p>
      </div>

      <div className="bg-shelvarr-surface border border-shelvarr-border rounded-lg p-4 space-y-3">
        <div className="flex justify-between">
          <span className="text-shelvarr-text-muted">Version</span>
          <span className="text-white">0.0.1</span>
        </div>
        <div className="flex justify-between">
          <span className="text-shelvarr-text-muted">Framework</span>
          <span className="text-white">Next.js 16</span>
        </div>
        <div className="flex justify-between">
          <span className="text-shelvarr-text-muted">Database</span>
          <span className="text-white">SQLite</span>
        </div>
      </div>

      <div>
        <h3 className="text-md font-semibold text-white mb-2">Metadata Sources</h3>
        <ul className="text-shelvarr-text-muted space-y-1">
          <li>Google Books - Book metadata and covers</li>
          <li>OpenLibrary - Open source book database</li>
          <li>Hardcover - Book discovery platform (API key required)</li>
          <li>BookBrainz - Open book encyclopedia</li>
          <li>Audnexus - Audiobook metadata</li>
          <li>ComicVine - Comic book database (API key required)</li>
          <li>Wikidata - Knowledge base with series info</li>
        </ul>
      </div>

      <div>
        <h3 className="text-md font-semibold text-white mb-2">Links</h3>
        <div className="space-y-2">
          <a
            href="https://github.com/your-repo/shelvarr"
            target="_blank"
            rel="noopener noreferrer"
            className="block text-blue-400 hover:text-blue-300 transition-colors"
          >
            GitHub Repository
          </a>
          <a
            href="https://github.com/your-repo/shelvarr/issues"
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
