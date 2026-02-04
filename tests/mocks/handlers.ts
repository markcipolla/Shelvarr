/**
 * MSW Request Handlers
 * Mock handlers for external API calls during testing
 */

import { http, HttpResponse } from 'msw';

// Hardcover GraphQL API handlers
export const hardcoverHandlers = [
  http.post('https://api.hardcover.app/v1/graphql', async ({ request }) => {
    const body = await request.json() as { query?: string; variables?: Record<string, unknown> };
    const query = body?.query || '';

    // Search books query
    if (query.includes('search_books') || query.includes('searchBooks')) {
      const searchTerm = (body?.variables as { query?: string })?.query || '';

      if (searchTerm === 'nonexistent_book_xyz') {
        return HttpResponse.json({
          data: { search_books: { results: [] } }
        });
      }

      return HttpResponse.json({
        data: {
          search_books: {
            results: [
              {
                _id: 'hc_mock_1',
                document: {
                  id: 123,
                  title: `Mock Book: ${searchTerm}`,
                  slug: 'mock-book',
                  image: { url: 'https://example.com/cover.jpg' },
                  contributions: [{ author: { name: 'Mock Author' } }],
                  release_year: 2023,
                  publisher: { name: 'Mock Publisher' },
                  description: 'A mock book description for testing.',
                  identifiers: [{ source: { name: 'isbn_13' }, value: '9781234567890' }],
                  book_series: [{ series: { name: 'Mock Series' }, position: 1 }]
                }
              }
            ]
          }
        }
      });
    }

    // Get book by ID query
    if (query.includes('book(') || query.includes('books_by_pk')) {
      return HttpResponse.json({
        data: {
          books_by_pk: {
            id: 123,
            title: 'Mock Book by ID',
            slug: 'mock-book-by-id',
            image: { url: 'https://example.com/cover.jpg' },
            contributions: [{ author: { name: 'Mock Author' } }],
            release_year: 2023,
            publisher: { name: 'Mock Publisher' },
            description: 'A mock book fetched by ID.',
            identifiers: [{ source: { name: 'isbn_13' }, value: '9781234567890' }],
            book_series: []
          }
        }
      });
    }

    // Search series query
    if (query.includes('search_series') || query.includes('series')) {
      return HttpResponse.json({
        data: {
          search_series: {
            results: [
              {
                document: {
                  id: 1,
                  name: 'Mock Series',
                  books_count: 5,
                  books: [
                    { id: 1, title: 'Book 1', position: 1 },
                    { id: 2, title: 'Book 2', position: 2 }
                  ]
                }
              }
            ]
          }
        }
      });
    }

    return HttpResponse.json({ data: {} });
  }),
];

// Komga API handlers
export const komgaHandlers = [
  // Test connection
  http.get('*/api/v1/libraries', ({ request }) => {
    const authHeader = request.headers.get('X-Auth-Token');
    if (!authHeader) {
      return new HttpResponse(null, { status: 401 });
    }
    return HttpResponse.json([
      { id: 'lib1', name: 'Test Library', root: '/books' }
    ]);
  }),

  // Get libraries
  http.get('*/api/v2/libraries', ({ request }) => {
    const authHeader = request.headers.get('X-Auth-Token');
    if (!authHeader) {
      return new HttpResponse(null, { status: 401 });
    }
    return HttpResponse.json({
      content: [
        { id: 'lib1', name: 'Comics', root: '/comics' },
        { id: 'lib2', name: 'Books', root: '/books' }
      ]
    });
  }),

  // Scan library
  http.post('*/api/v1/libraries/:id/scan', () => {
    return new HttpResponse(null, { status: 202 });
  }),

  // Get series
  http.get('*/api/v1/series', () => {
    return HttpResponse.json({
      content: [
        { id: 'series1', name: 'Test Series', booksCount: 3 }
      ],
      totalElements: 1
    });
  }),

  // Get books
  http.get('*/api/v1/books', () => {
    return HttpResponse.json({
      content: [
        { id: 'book1', name: 'Test Book', seriesId: 'series1' }
      ],
      totalElements: 1
    });
  }),
];

// OpenLibrary API handlers
export const openLibraryHandlers = [
  // Author search
  http.get('https://openlibrary.org/search/authors.json', ({ request }) => {
    const url = new URL(request.url);
    const query = url.searchParams.get('q') || '';

    if (query === 'unknown_author_xyz') {
      return HttpResponse.json({ docs: [] });
    }

    return HttpResponse.json({
      docs: [
        {
          key: '/authors/OL123A',
          name: query || 'Mock Author',
          birth_date: '1970',
          top_work: 'Famous Book',
          work_count: 25
        }
      ]
    });
  }),

  // Author details
  http.get('https://openlibrary.org/authors/:id.json', ({ params }) => {
    return HttpResponse.json({
      key: `/authors/${params.id}`,
      name: 'Mock Author',
      bio: 'A mock author biography for testing.',
      birth_date: '1970-01-01',
      photos: [12345]
    });
  }),

  // Author works
  http.get('https://openlibrary.org/authors/:id/works.json', () => {
    return HttpResponse.json({
      entries: [
        {
          key: '/works/OL456W',
          title: 'Mock Work',
          first_publish_year: 2020,
          covers: [67890]
        }
      ]
    });
  }),
];

// Download source handlers (LibGen, Anna's Archive, Z-Library)
export const downloadSourceHandlers = [
  // Anna's Archive search
  http.get('https://annas-archive.org/search', ({ request }) => {
    const url = new URL(request.url);
    const query = url.searchParams.get('q') || '';

    if (query === 'no_results_test') {
      return HttpResponse.text('<html><body>No results found</body></html>');
    }

    return HttpResponse.text(`
      <html>
        <body>
          <div class="h-[125px]">
            <a href="/md5/abc123def456">
              <div>
                <h3>Mock Book: ${query}</h3>
                <div class="text-sm">Mock Author</div>
                <div>epub, 1.5MB</div>
              </div>
            </a>
          </div>
        </body>
      </html>
    `);
  }),

  // LibGen search
  http.get('https://libgen.is/search.php', ({ request }) => {
    const url = new URL(request.url);
    const query = url.searchParams.get('req') || '';

    return HttpResponse.text(`
      <html>
        <body>
          <table class="c">
            <tr>
              <td>123</td>
              <td><a href="book.php?md5=abc123">Mock Author</a></td>
              <td>Mock Book: ${query}</td>
              <td>Mock Publisher</td>
              <td>2023</td>
              <td>epub</td>
              <td>1.5 MB</td>
            </tr>
          </table>
        </body>
      </html>
    `);
  }),

  // LibGen download
  http.get('https://libgen.is/book/index.php', () => {
    return HttpResponse.text(`
      <html>
        <body>
          <a href="https://download.example.com/file.epub">Download</a>
        </body>
      </html>
    `);
  }),

  // Source status check (open-slum.org)
  http.get('https://open-slum.org/api/status', () => {
    return HttpResponse.json({
      sources: [
        { name: 'libgen', status: 'up', responseTime: 150 },
        { name: 'annas', status: 'up', responseTime: 200 },
        { name: 'zlibrary', status: 'degraded', responseTime: 500 }
      ]
    });
  }),
];

// Combine all handlers
export const handlers = [
  ...hardcoverHandlers,
  ...komgaHandlers,
  ...openLibraryHandlers,
  ...downloadSourceHandlers,
];
