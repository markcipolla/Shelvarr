import { getDuplicatesAction } from '@/lib/actions/duplicates';
import { DuplicatesReview } from '@/components/duplicates/DuplicatesReview';

export const dynamic = 'force-dynamic';

export default async function DuplicatesPage() {
  const { books, comics } = await getDuplicatesAction();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Duplicates</h1>
        <p className="text-shelvarr-text-muted mt-1">
          Everything the library is holding more than once. Nothing is removed until you say so.
        </p>
      </div>

      <DuplicatesReview books={books} comics={comics} />
    </div>
  );
}
