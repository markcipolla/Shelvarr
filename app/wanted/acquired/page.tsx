import { getWantedBooks } from '@/lib/actions/wanted';
import { WantedBookGrid } from '@/components/wanted/WantedBookGrid';

export const dynamic = 'force-dynamic';

export default async function AcquiredPage() {
  const allBooks = await getWantedBooks();

  // Filter to only show acquired and found books
  const acquiredBooks = allBooks.filter((b) => b.status === 'acquired' || b.status === 'found');

  // Count by status
  const statusCounts = {
    found: acquiredBooks.filter((b) => b.status === 'found').length,
    acquired: acquiredBooks.filter((b) => b.status === 'acquired').length,
  };

  return (
    <>
      {/* Status Summary */}
      {acquiredBooks.length > 0 && (
        <div className="grid grid-cols-2 gap-4 mb-6">
          <StatusCard
            label="Found"
            count={statusCounts.found}
            color="green"
          />
          <StatusCard
            label="Acquired"
            count={statusCounts.acquired}
            color="purple"
          />
        </div>
      )}

      {/* Book Grid */}
      <WantedBookGrid books={acquiredBooks} />
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
