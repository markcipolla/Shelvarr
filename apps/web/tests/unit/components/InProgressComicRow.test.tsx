/**
 * Unit tests for the home page's Currently Reading Comics shelf.
 *
 * A volume sits on this shelf because of one part-read issue, so the "×" marks
 * that issue read rather than the whole volume. As with books it sits inside
 * the card's link and must not open the volume, and it leaves the page out so
 * the server keeps the reader's place in the issue.
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

const { InProgressComicRow } = await import(
  '../../../components/comics/InProgressComicRow.js'
);

const comic = {
  volume: {
    id: 3,
    slug: 'sandman',
    title: 'Sandman',
    publisher: 'DC',
    year: 1989,
    issue_count: 75,
    issues_downloaded: 20,
  },
  issueId: 42,
  issueNumber: '4',
  page: 7,
  total: 22,
  updatedAt: '2026-09-01T00:00:00Z',
} as any;

/** What the "×" on a card announces itself as. */
const removeLabel = (title: string, issue: string) =>
  `Finished ${title} ${issue} — remove from Currently Reading`;

type FetchCall = { url: string; init: RequestInit };
let fetchCalls: FetchCall[] = [];
let fetchResponse: { ok: boolean; body: unknown } = { ok: true, body: {} };
const originalFetch = globalThis.fetch;

describe('InProgressComicRow Component', () => {
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

  it('shows where the reader is up to, alongside the ×', () => {
    render(<InProgressComicRow comics={[comic]} />);

    assert.ok(screen.getByText('Reading #4'));
    assert.ok(screen.getByRole('button', { name: removeLabel('Sandman', '#4') }));
  });

  it('marks the part-read issue read, not the whole volume', async () => {
    const user = userEvent.setup();
    render(<InProgressComicRow comics={[comic]} />);

    await user.click(screen.getByRole('button', { name: removeLabel('Sandman', '#4') }));

    await waitFor(() => assert.strictEqual(mockRefresh.mock.callCount(), 1));
    assert.strictEqual(fetchCalls.length, 1);
    assert.strictEqual(fetchCalls[0]?.url, '/api/comics/issues/42/progress');
    assert.strictEqual(fetchCalls[0]?.init.method, 'PATCH');
    assert.deepStrictEqual(JSON.parse(fetchCalls[0]?.init.body as string), {
      completed: true,
      total: 22,
    });
    assert.strictEqual(
      mockToastSuccess.mock.calls[0]?.arguments[0],
      'Marked Sandman #4 as read'
    );
  });

  it('leaves the page count out for an issue whose length is unknown', async () => {
    const user = userEvent.setup();
    render(<InProgressComicRow comics={[{ ...comic, total: null }]} />);

    await user.click(screen.getByRole('button', { name: removeLabel('Sandman', '#4') }));

    await waitFor(() => assert.strictEqual(fetchCalls.length, 1));
    assert.deepStrictEqual(JSON.parse(fetchCalls[0]?.init.body as string), { completed: true });
  });

  it('names the issue generically when the volume does not number it', () => {
    render(<InProgressComicRow comics={[{ ...comic, issueNumber: null }]} />);

    assert.ok(screen.getByRole('button', { name: removeLabel('Sandman', 'this issue') }));
    assert.ok(screen.getByText('Reading'));
  });

  it("keeps the ×'s click away from the card's link, which would open the volume", async () => {
    const user = userEvent.setup();
    const outerClick = mock.fn();
    render(
      <div onClick={outerClick}>
        <InProgressComicRow comics={[comic]} />
      </div>
    );

    // The × really is inside the link — otherwise there is nothing to stop.
    assert.ok(screen.getByRole('link').contains(
      screen.getByRole('button', { name: removeLabel('Sandman', '#4') })
    ));

    await user.click(screen.getByRole('button', { name: removeLabel('Sandman', '#4') }));

    assert.strictEqual(outerClick.mock.callCount(), 0);
  });

  it('reports the error and leaves the volume on the shelf when the server refuses', async () => {
    fetchResponse = { ok: false, body: { error: 'Invalid id' } };
    const user = userEvent.setup();
    render(<InProgressComicRow comics={[comic]} />);

    await user.click(screen.getByRole('button', { name: removeLabel('Sandman', '#4') }));

    await waitFor(() => assert.strictEqual(mockToastError.mock.callCount(), 1));
    assert.strictEqual(mockToastError.mock.calls[0]?.arguments[0], 'Invalid id');
    assert.strictEqual(mockRefresh.mock.callCount(), 0);
    assert.ok(screen.getByRole('button', { name: removeLabel('Sandman', '#4') }));
  });
});
