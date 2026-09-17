/**
 * Unit tests for BookPageReader, the CBZ/CBR book reader.
 *
 * Mirrors ComicReader.test.tsx's conventions, adjusted for the two ways this
 * component's progress plumbing genuinely differs: it takes its starting
 * page from the `readProgress` prop already threaded down through
 * BookActions instead of firing its own GET, and it saves/completes through
 * `/api/books/:id/read-progress` (`{ page, completed }`, no `total`) instead
 * of the comic progress endpoint.
 */

import { describe, it, mock, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import '../../../tests/setup-react.js';
import { render, screen, waitFor, cleanup, fireEvent, act } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';

const mockRefresh = mock.fn();

mock.module('next/navigation', {
  namedExports: {
    useRouter: () => ({
      push: () => {},
      refresh: mockRefresh,
      replace: () => {},
      prefetch: () => {},
      back: () => {},
    }),
  },
});

const { BookPageReader } = await import('../../../components/books/BookPageReader.js');

const book = {
  id: 9,
  title: 'Sandman Vol. 1',
  authors: JSON.stringify(['Neil Gaiman']),
  filePath: '/books/sandman-01.cbz',
  metadataSource: null,
} as any;

type FetchCall = { url: string; init?: RequestInit };
let fetchCalls: FetchCall[] = [];
let pagesResponse: { ok: boolean; status: number; body: unknown } = {
  ok: true,
  status: 200,
  body: { count: 5, pages: [1, 2, 3, 4, 5].map((n) => ({ n })) },
};
const originalFetch = globalThis.fetch;

function installFetchMock() {
  globalThis.fetch = (async (url: string, init?: RequestInit) => {
    fetchCalls.push({ url, init });

    if (url.includes('/pages') && !url.match(/\/pages\/\d+$/)) {
      return {
        ok: pagesResponse.ok,
        status: pagesResponse.status,
        json: async () => pagesResponse.body,
      } as unknown as Response;
    }

    if (url.includes('/read-progress')) {
      return { ok: true, json: async () => null } as Response;
    }

    return { ok: true, json: async () => ({}) } as Response;
  }) as typeof fetch;
}

describe('BookPageReader Component', () => {
  beforeEach(() => {
    fetchCalls = [];
    pagesResponse = { ok: true, status: 200, body: { count: 5, pages: [1, 2, 3, 4, 5].map((n) => ({ n })) } };
    mockRefresh.mock.resetCalls();
    installFetchMock();
  });

  afterEach(() => {
    cleanup();
    globalThis.fetch = originalFetch;
    mock.timers.reset();
  });

  it('fetches the page count and renders a page indicator, without a redundant progress GET', async () => {
    render(<BookPageReader book={book} onClose={() => {}} />);

    await waitFor(() => {
      assert.ok(screen.getByText('1 / 5'));
    });
    assert.ok(fetchCalls.some((c) => c.url === '/api/books/9/pages'));
    assert.ok(!fetchCalls.some((c) => c.url === '/api/books/9/read-progress' && (c.init?.method ?? 'GET') === 'GET'));
  });

  it('opens at the page from the readProgress prop, not page 1', async () => {
    render(<BookPageReader book={book} readProgress={{ page: 3, completed: false }} onClose={() => {}} />);

    await waitFor(() => {
      assert.ok(screen.getByText('3 / 5'));
    });
    assert.ok(screen.getByAltText('Page 3'));
  });

  it('opens at page 1 when there is no saved progress', async () => {
    render(<BookPageReader book={book} onClose={() => {}} />);

    await waitFor(() => assert.ok(screen.getByText('1 / 5')));
    assert.ok(screen.getByAltText('Page 1'));
  });

  it('advances the page on a click and debounces a PATCH of the new page', async () => {
    render(<BookPageReader book={book} onClose={() => {}} />);

    await waitFor(() => assert.ok(screen.getByText('1 / 5')));
    const nextButton = screen.getByRole('button', { name: 'Next page' });

    mock.timers.enable({ apis: ['setTimeout'] });
    try {
      fireEvent.click(nextButton);
      assert.ok(screen.getByText('2 / 5'));

      assert.strictEqual(
        fetchCalls.filter((c) => c.url === '/api/books/9/read-progress' && c.init?.method === 'PATCH').length,
        0
      );

      mock.timers.tick(2000);
      await Promise.resolve();
      await Promise.resolve();
    } finally {
      mock.timers.reset();
    }

    const patch = fetchCalls.find(
      (c) => c.url === '/api/books/9/read-progress' && c.init?.method === 'PATCH'
    );
    assert.ok(patch, 'expected a debounced PATCH to be sent');
    assert.deepStrictEqual(JSON.parse(patch!.init!.body as string), { page: 2, completed: false });
  });

  it('advances the page with the right-arrow key and goes back with the left-arrow key', async () => {
    render(<BookPageReader book={book} onClose={() => {}} />);
    await waitFor(() => assert.ok(screen.getByText('1 / 5')));

    // The page indicator appearing means React has committed the DOM, not that
    // it has run passive effects — and the keydown listener is registered in
    // one, closed over the page count the same async load set. Dispatching in
    // that window hits either no listener or one whose `goToPage` still sees
    // pageCount 0 and early-returns, so the key is silently swallowed. Flush
    // effects first; under a loaded CI runner that window is wide enough to
    // fail on.
    await act(async () => {});

    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' }));
    });
    await waitFor(() => assert.ok(screen.getByText('2 / 5')));

    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft' }));
    });
    await waitFor(() => assert.ok(screen.getByText('1 / 5')));
  });

  it('marks the book complete on reaching the last page', async () => {
    pagesResponse = { ok: true, status: 200, body: { count: 2, pages: [{ n: 1 }, { n: 2 }] } };
    const user = userEvent.setup();

    render(<BookPageReader book={book} readProgress={{ page: 1, completed: false }} onClose={() => {}} />);
    await waitFor(() => assert.ok(screen.getByText('1 / 2')));

    await user.click(screen.getByRole('button', { name: 'Next page' }));
    assert.ok(screen.getByText('2 / 2'));

    await waitFor(() => {
      const complete = fetchCalls.find(
        (c) => c.url === '/api/books/9/read-progress' && c.init?.method === 'PATCH'
          && JSON.parse(c.init!.body as string).completed === true
      );
      assert.ok(complete, 'expected a completion PATCH on reaching the last page');
      assert.deepStrictEqual(JSON.parse(complete!.init!.body as string), { page: 2, completed: true });
    });
    await waitFor(() => assert.strictEqual(mockRefresh.mock.callCount(), 1));
  });

  it('does not re-fire a completion PATCH for a book already marked completed', async () => {
    pagesResponse = { ok: true, status: 200, body: { count: 2, pages: [{ n: 1 }, { n: 2 }] } };
    const user = userEvent.setup();

    render(<BookPageReader book={book} readProgress={{ page: 1, completed: true }} onClose={() => {}} />);
    await waitFor(() => assert.ok(screen.getByText('1 / 2')));

    await user.click(screen.getByRole('button', { name: 'Next page' }));
    assert.ok(screen.getByText('2 / 2'));

    // Give any stray async work a chance to run, then confirm no completion
    // PATCH and no refresh — only the debounced page-save should fire.
    await new Promise((resolve) => setTimeout(resolve, 0));
    const complete = fetchCalls.find(
      (c) => c.url === '/api/books/9/read-progress' && c.init?.method === 'PATCH'
        && JSON.parse(c.init!.body as string).completed === true
    );
    assert.strictEqual(complete, undefined);
    assert.strictEqual(mockRefresh.mock.callCount(), 0);
  });

  it('flushes a pending save on unmount instead of losing it to the debounce window', async () => {
    const user = userEvent.setup();
    const { unmount } = render(<BookPageReader book={book} onClose={() => {}} />);
    await waitFor(() => assert.ok(screen.getByText('1 / 5')));

    await user.click(screen.getByRole('button', { name: 'Next page' }));
    unmount();

    await waitFor(() => {
      const patch = fetchCalls.find(
        (c) => c.url === '/api/books/9/read-progress' && c.init?.method === 'PATCH'
      );
      assert.ok(patch, 'expected unmount to flush the pending save');
    });
  });

  it('shows an error with a download link when the page API fails', async () => {
    pagesResponse = { ok: false, status: 400, body: { error: 'EPUB books are not paginated by this API' } };

    render(<BookPageReader book={book} onClose={() => {}} />);

    await waitFor(() => {
      assert.ok(screen.getByText(/Failed to load book/));
    });
    const link = screen.getByRole('link', { name: /download file/i });
    assert.strictEqual(link.getAttribute('href'), '/api/books/9/file');
  });

  it('flushes a pending save when the close button is used', async () => {
    const onClose = mock.fn();
    const user = userEvent.setup();
    render(<BookPageReader book={book} onClose={onClose} />);
    await waitFor(() => assert.ok(screen.getByText('1 / 5')));

    await user.click(screen.getByRole('button', { name: 'Next page' }));
    await user.click(screen.getByLabelText('Close reader'));

    await waitFor(() => {
      const patch = fetchCalls.find(
        (c) => c.url === '/api/books/9/read-progress' && c.init?.method === 'PATCH'
      );
      assert.ok(patch, 'expected the close button to flush the pending save');
    });
    assert.strictEqual(onClose.mock.callCount(), 1);
  });
});
