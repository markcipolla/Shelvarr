/**
 * Unit tests for the home page's Currently Reading shelf.
 *
 * Each cover carries an "×" that marks the book read, for a book finished away
 * from the reader that would otherwise never leave the shelf. It sits inside
 * the card's link, so it must not open the book, and the request leaves the
 * page out so the server keeps the reader's place.
 */

import { describe, it, mock, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import '../../../tests/setup-react.js';
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';

const mockRefresh = mock.fn();
const mockToastSuccess = mock.fn();
const mockToastError = mock.fn();

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

mock.module('next/link', {
  namedExports: {},
  defaultExport: ({ children, href, ...rest }: any) => (
    <a href={href} {...rest}>{children}</a>
  ),
});

mock.module('../../../components/ui/Toast.js', {
  namedExports: {
    useToast: () => ({ success: mockToastSuccess, error: mockToastError }),
  },
});

const { CurrentlyReadingRow } = await import(
  '../../../components/books/CurrentlyReadingRow.js'
);

const book = {
  id: 7,
  title: 'The Final Empire',
  filePath: '/books/the-final-empire.epub',
  authors: '["Brandon Sanderson"]',
  coverUrl: null,
  progressPercent: 40,
} as any;

/** What the "×" on a card announces itself as. */
const removeLabel = (title: string) => `Finished "${title}" — remove from Currently Reading`;

type FetchCall = { url: string; init: RequestInit };
let fetchCalls: FetchCall[] = [];
let fetchResponse: { ok: boolean; body: unknown } = { ok: true, body: {} };
const originalFetch = globalThis.fetch;

describe('CurrentlyReadingRow Component', () => {
  beforeEach(() => {
    fetchCalls = [];
    fetchResponse = { ok: true, body: {} };
    mockRefresh.mock.resetCalls();
    mockToastSuccess.mock.resetCalls();
    mockToastError.mock.resetCalls();
    globalThis.fetch = (async (url: string, init: RequestInit) => {
      fetchCalls.push({ url, init });
      return {
        ok: fetchResponse.ok,
        json: async () => fetchResponse.body,
      } as Response;
    }) as typeof fetch;
  });

  afterEach(() => {
    cleanup();
    globalThis.fetch = originalFetch;
  });

  it('offers an × on every book on the shelf', () => {
    render(<CurrentlyReadingRow books={[book, { ...book, id: 8, title: 'Mistborn' }]} />);

    assert.ok(screen.getByRole('button', { name: removeLabel('The Final Empire') }));
    assert.ok(screen.getByRole('button', { name: removeLabel('Mistborn') }));
  });

  it('marks the book read without sending a page, then refreshes the shelf', async () => {
    const user = userEvent.setup();
    render(<CurrentlyReadingRow books={[book]} />);

    await user.click(screen.getByRole('button', { name: removeLabel('The Final Empire') }));

    await waitFor(() => assert.strictEqual(mockRefresh.mock.callCount(), 1));
    assert.strictEqual(fetchCalls.length, 1);
    assert.strictEqual(fetchCalls[0]?.url, '/api/books/7/read-progress');
    assert.strictEqual(fetchCalls[0]?.init.method, 'PATCH');
    assert.deepStrictEqual(JSON.parse(fetchCalls[0]?.init.body as string), { completed: true });
    assert.strictEqual(
      mockToastSuccess.mock.calls[0]?.arguments[0],
      'Marked "The Final Empire" as read'
    );
  });

  it('keeps the ×\'s click away from the card\'s link, which would open the book', async () => {
    const user = userEvent.setup();
    const outerClick = mock.fn();
    render(
      <div onClick={outerClick}>
        <CurrentlyReadingRow books={[book]} />
      </div>
    );

    // The × really is inside the link — otherwise there is nothing to stop.
    assert.ok(screen.getByRole('link').contains(
      screen.getByRole('button', { name: removeLabel('The Final Empire') })
    ));

    await user.click(screen.getByRole('button', { name: removeLabel('The Final Empire') }));

    assert.strictEqual(outerClick.mock.callCount(), 0);
  });

  it('reports the error and leaves the book on the shelf when the server refuses', async () => {
    fetchResponse = { ok: false, body: { error: 'Book not found' } };
    const user = userEvent.setup();
    render(<CurrentlyReadingRow books={[book]} />);

    await user.click(screen.getByRole('button', { name: removeLabel('The Final Empire') }));

    await waitFor(() => assert.strictEqual(mockToastError.mock.callCount(), 1));
    assert.strictEqual(mockToastError.mock.calls[0]?.arguments[0], 'Book not found');
    assert.strictEqual(mockRefresh.mock.callCount(), 0);
    assert.ok(screen.getByRole('button', { name: removeLabel('The Final Empire') }));
  });
});
