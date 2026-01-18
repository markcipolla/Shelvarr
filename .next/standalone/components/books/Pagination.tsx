import Link from 'next/link';

interface PaginationProps {
  currentPage: number;
  totalPages: number;
  baseUrl: string;
  searchParams?: Record<string, string | undefined>;
}

export function Pagination({
  currentPage,
  totalPages,
  baseUrl,
  searchParams = {},
}: PaginationProps) {
  if (totalPages <= 1) return null;

  const buildUrl = (page: number) => {
    const params = new URLSearchParams();
    Object.entries(searchParams).forEach(([key, value]) => {
      if (value) params.set(key, value);
    });
    if (page > 1) params.set('page', String(page));
    const queryString = params.toString();
    return queryString ? `${baseUrl}?${queryString}` : baseUrl;
  };

  // Generate page numbers to show
  const pages: (number | 'ellipsis')[] = [];
  const delta = 2;

  for (let i = 1; i <= totalPages; i++) {
    if (
      i === 1 ||
      i === totalPages ||
      (i >= currentPage - delta && i <= currentPage + delta)
    ) {
      pages.push(i);
    } else if (pages[pages.length - 1] !== 'ellipsis') {
      pages.push('ellipsis');
    }
  }

  return (
    <nav className="flex items-center justify-center gap-1">
      <Link
        href={buildUrl(currentPage - 1)}
        className={`px-3 py-2 rounded-lg ${
          currentPage === 1
            ? 'text-shelvarr-text-muted pointer-events-none'
            : 'text-white hover:bg-shelvarr-surface'
        }`}
        aria-disabled={currentPage === 1}
      >
        Previous
      </Link>

      {pages.map((page, index) =>
        page === 'ellipsis' ? (
          <span key={`ellipsis-${index}`} className="px-3 py-2 text-shelvarr-text-muted">
            ...
          </span>
        ) : (
          <Link
            key={page}
            href={buildUrl(page)}
            className={`px-3 py-2 rounded-lg min-w-[40px] text-center ${
              page === currentPage
                ? 'bg-blue-600 text-white'
                : 'text-white hover:bg-shelvarr-surface'
            }`}
          >
            {page}
          </Link>
        )
      )}

      <Link
        href={buildUrl(currentPage + 1)}
        className={`px-3 py-2 rounded-lg ${
          currentPage === totalPages
            ? 'text-shelvarr-text-muted pointer-events-none'
            : 'text-white hover:bg-shelvarr-surface'
        }`}
        aria-disabled={currentPage === totalPages}
      >
        Next
      </Link>
    </nav>
  );
}
