import { getWantedBooks } from '@/lib/actions/wanted';
import { getDownloadSourceStatuses } from '@/lib/actions/downloads';
import { WantedBookGrid } from '@/components/wanted/WantedBookGrid';
import { SourceStatusBar } from '@/components/wanted/SourceStatusBadge';

export const dynamic = 'force-dynamic';

export default async function WantedListPage() {
  const [allBooks, sourceStatuses] = await Promise.all([
    getWantedBooks(),
    getDownloadSourceStatuses(),
  ]);

  // Filter to only show wanted and searching books
  const wantedBooks = allBooks.filter((b) => b.status === 'wanted' || b.status === 'searching');

  // Count by status
  const statusCounts = {
    wanted: wantedBooks.filter((b) => b.status === 'wanted').length,
    searching: wantedBooks.filter((b) => b.status === 'searching').length,
  };

  return (
    <>
      {/* Source Status */}
      <div className="mb-6 p-4 bg-shelvarr-surface border border-shelvarr-border rounded-lg">
        <SourceStatusBar statuses={sourceStatuses} />
      </div>

      {/* Status Summary */}
      {wantedBooks.length > 0 && (
        <div className="grid grid-cols-2 gap-4 mb-6">
          <StatusCard
            label="Wanted"
            count={statusCounts.wanted}
            color="blue"
          />
          <StatusCard
            label="Searching"
            count={statusCounts.searching}
            color="yellow"
          />
        </div>
      )}

      {/* Book Grid */}
      <WantedBookGrid books={wantedBooks} />
    </>
  );
}

function StatusCard({
  label,
  count,
  color,
}: {
  label: string;
  count: number;
  color: 'blue' | 'yellow' | 'green' | 'purple';
}) {
  const colors = {
    blue: 'bg-blue-600/20 border-blue-600/50 text-blue-400',
    yellow: 'bg-yellow-600/20 border-yellow-600/50 text-yellow-400',
    green: 'bg-green-600/20 border-green-600/50 text-green-400',
    purple: 'bg-purple-600/20 border-purple-600/50 text-purple-400',
  };

  return (
    <div className={`rounded-lg border p-4 ${colors[color]}`}>
      <div className="text-2xl font-bold">{count}</div>
      <div className="text-sm opacity-80">{label}</div>
    </div>
  );
}
