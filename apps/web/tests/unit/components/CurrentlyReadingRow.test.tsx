/**
 * Unit tests for the home page's Currently Reading shelf.
 *
 * Each cover carries an "×" that removes the book from the shelf. It sits
 * inside the card's link, so it must not also open the book.
 */

import { describe, it, mock, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import '../../../tests/setup-react.js';
import type { ReactElement } from 'react';
import { render, waitFor, cleanup } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';

const mockRefresh = mock.fn();
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
  // Render as <div> rather than <a>: jsdom enforces the HTML5 rule that
  // interactive content (<button>) cannot be nested inside <a>, moving the
  // button outside React's root div so click events never reach React handlers.
  defaultExport: ({ children, href }: any) => (
    <div data-href={href}>{children}</div>
  ),
});

mock.module('../../../components/ui/Toast.js', {
  namedExports: {
    useToast: () => ({ success: mock.fn(), error: mockToastError }),
  },
});

const { CurrentlyReadingRow } = await import(
  '../../../components/books/CurrentlyReadingRow.js'
);

// Updated by renderTest() — container is React's direct mount point, guaranteed
// to be in the right document regardless of how testing-library wires document.
let _container: Element = document.body;

function renderTest(ui: ReactElement) {
  const result = render(ui);
  _container = result.container;
  return result;
}

const book = {
  id: 7,
  title: 'The Final Empire',
  filePath: '/books/the-final-empire.epub',
  authors: '["Brandon Sanderson"]',
  coverUrl: null,
  progressPercent: 40,
} as any;

/** What the "×" on a card announces itself as. */
const removeLabel = (title: string) => `Remove "${title}" from Currently Reading`;

const removeBtn = (title: string): HTMLElement | null => {
  const name = removeLabel(title);
  for (const btn of _container.querySelectorAll<HTMLElement>('button')) {
    if (btn.getAttribute('aria-label') === name) return btn;
  }
  return null;
};

type FetchCall = { url: string; init: RequestInit };
let fetchCalls: FetchCall[] = [];
let fetchResponse: { ok: boolean; body: unknown } = { ok: true, body: {} };
const originalFetch = globalThis.fetch;

describe('CurrentlyReadingRow Component', () => {
  beforeEach(() => {
    fetchCalls = [];
    fetchResponse = { ok: true, body: {} };
    mockRefresh.mock.resetCalls();
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
    renderTest(<CurrentlyReadingRow books={[book, { ...book, id: 8, title: 'Mistborn' }]} />);

    assert.ok(removeBtn('The Final Empire'));
    assert.ok(removeBtn('Mistborn'));
  });

  it('removes the book from Currently Reading and refreshes the shelf', async () => {
    const user = userEvent.setup({ document });
    renderTest(<CurrentlyReadingRow books={[book]} />);

    await user.click(removeBtn('The Final Empire'));

    await waitFor(() => assert.strictEqual(mockRefresh.mock.callCount(), 1));
    assert.strictEqual(fetchCalls.length, 1);
    assert.strictEqual(fetchCalls[0]?.url, '/api/books/7/read-progress');
    assert.strictEqual(fetchCalls[0]?.init.method, 'DELETE');
  });

  it('keeps the ×\'s click away from the card\'s link, which would open the book', async () => {
    const user = userEvent.setup({ document });
    const outerClick = mock.fn();
    renderTest(
      <div onClick={outerClick}>
        <CurrentlyReadingRow books={[book]} />
      </div>
    );

    await user.click(removeBtn('The Final Empire'));

    assert.strictEqual(outerClick.mock.callCount(), 0);
  });

  it('reports the error and leaves the book on the shelf when the server refuses', async () => {
    fetchResponse = { ok: false, body: {} };
    const user = userEvent.setup({ document });
    renderTest(<CurrentlyReadingRow books={[book]} />);

    await user.click(removeBtn('The Final Empire'));

    await waitFor(() => assert.strictEqual(mockToastError.mock.callCount(), 1));
    assert.strictEqual(
      mockToastError.mock.calls[0]?.arguments[0],
      'Failed to remove from Currently Reading'
    );
    assert.strictEqual(mockRefresh.mock.callCount(), 0);
    assert.ok(removeBtn('The Final Empire'));
  });
});
