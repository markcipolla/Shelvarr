/**
 * Unit tests for ComicReader.
 *
 * Covers loading the page count from the page-level comic API, restoring
 * this person's saved position, turning pages by click and by arrow key
 * (debounced-saving progress the same way EpubReader debounces its saves),
 * marking the issue complete on reaching the last page, and falling back to
 * a plain download link when the issue is a PDF (the /pages route 400s).
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

const { ComicReader } = await import('../../../components/comics/ComicReader.js');

type FetchCall = { url: string; init?: RequestInit };
let fetchCalls: FetchCall[] = [];
let pagesResponse: { ok: boolean; status: number; body: unknown } = {
  ok: true,
  status: 200,
  body: { count: 5, pages: [1, 2, 3, 4, 5].map((n) => ({ n })) },
};
let progressResponse: { ok: boolean; body: unknown } = { ok: true, body: null };
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

    if (url.includes('/progress')) {
      const method = init?.method ?? 'GET';
      if (method === 'GET') {
        return {
          ok: progressResponse.ok,
          json: async () => progressResponse.body,
        } as Response;
      }
      // PATCH
      return { ok: true, json: async () => null } as Response;
    }

    return { ok: true, json: async () => ({}) } as Response;
  }) as typeof fetch;
}

describe('ComicReader Component', () => {
  beforeEach(() => {
    fetchCalls = [];
    pagesResponse = { ok: true, status: 200, body: { count: 5, pages: [1, 2, 3, 4, 5].map((n) => ({ n })) } };
    progressResponse = { ok: true, body: null };
    mockRefresh.mock.resetCalls();
    installFetchMock();
  });

  afterEach(() => {
    cleanup();
    globalThis.fetch = originalFetch;
    mock.timers.reset();
  });

  it('fetches the page count and renders a page indicator', async () => {
    render(<ComicReader issueId={9} volumeTitle="Sandman" issueNumber="1" onClose={() => {}} />);

    await waitFor(() => {
      assert.ok(screen.getByText('1 / 5'));
    });
    assert.ok(fetchCalls.some((c) => c.url === '/api/comics/issues/9/pages'));
    assert.ok(fetchCalls.some((c) => c.url === '/api/comics/issues/9/progress'));
  });

  it('restores the saved page on open', async () => {
    progressResponse = { ok: true, body: { page: 3, completed: false, total: 5 } };

    render(<ComicReader issueId={9} volumeTitle="Sandman" issueNumber="1" onClose={() => {}} />);

    await waitFor(() => {
      assert.ok(screen.getByText('3 / 5'));
    });
    assert.ok(screen.getByAltText('Page 3'));
  });

  it('opens at page 1 when there is no saved progress', async () => {
    render(<ComicReader issueId={9} volumeTitle="Sandman" issueNumber="1" onClose={() => {}} />);

    await waitFor(() => assert.ok(screen.getByText('1 / 5')));
    assert.ok(screen.getByAltText('Page 1'));
  });

  it('advances the page on a click and debounces a PATCH of the new page', async () => {
    render(<ComicReader issueId={9} volumeTitle="Sandman" issueNumber="1" onClose={() => {}} />);

    await waitFor(() => assert.ok(screen.getByText('1 / 5')));
    const nextButton = screen.getByRole('button', { name: 'Next page' });

    // Fake timers are only enabled once mount's own async work (which relies
    // on real promise microtasks, not timers) has already settled, and the
    // click that schedules the debounce timer happens while they're enabled
    // — same convention as EpubReader's debounce test.
    mock.timers.enable({ apis: ['setTimeout'] });
    try {
      fireEvent.click(nextButton);
      assert.ok(screen.getByText('2 / 5'));

      // Not sent immediately.
      assert.strictEqual(
        fetchCalls.filter((c) => c.url === '/api/comics/issues/9/progress' && c.init?.method === 'PATCH').length,
        0
      );

      mock.timers.tick(2000);
      await Promise.resolve();
      await Promise.resolve();
    } finally {
      mock.timers.reset();
    }

    const patch = fetchCalls.find(
      (c) => c.url === '/api/comics/issues/9/progress' && c.init?.method === 'PATCH'
    );
    assert.ok(patch, 'expected a debounced PATCH to be sent');
    assert.deepStrictEqual(JSON.parse(patch!.init!.body as string), { page: 2 });
  });

  it('advances the page with the right-arrow key and goes back with the left-arrow key', async () => {
    render(<ComicReader issueId={9} volumeTitle="Sandman" issueNumber="1" onClose={() => {}} />);
    await waitFor(() => assert.ok(screen.getByText('1 / 5')));

    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' }));
    });
    await waitFor(() => assert.ok(screen.getByText('2 / 5')));

    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft' }));
    });
    await waitFor(() => assert.ok(screen.getByText('1 / 5')));
  });

  it('marks the issue complete on reaching the last page', async () => {
    pagesResponse = { ok: true, status: 200, body: { count: 2, pages: [{ n: 1 }, { n: 2 }] } };
    progressResponse = { ok: true, body: { page: 1, completed: false, total: 2 } };
    const user = userEvent.setup();

    render(<ComicReader issueId={9} volumeTitle="Sandman" issueNumber="1" onClose={() => {}} />);
    await waitFor(() => assert.ok(screen.getByText('1 / 2')));

    await user.click(screen.getByRole('button', { name: 'Next page' }));
    assert.ok(screen.getByText('2 / 2'));

    await waitFor(() => {
      const complete = fetchCalls.find(
        (c) => c.url === '/api/comics/issues/9/progress' && c.init?.method === 'PATCH'
          && JSON.parse(c.init!.body as string).completed === true
      );
      assert.ok(complete, 'expected a completion PATCH on reaching the last page');
      assert.deepStrictEqual(JSON.parse(complete!.init!.body as string), { completed: true, total: 2 });
    });
    await waitFor(() => assert.strictEqual(mockRefresh.mock.callCount(), 1));
  });

  it('flushes a pending save on unmount instead of losing it to the debounce window', async () => {
    const user = userEvent.setup();
    const { unmount } = render(
      <ComicReader issueId={9} volumeTitle="Sandman" issueNumber="1" onClose={() => {}} />
    );
    await waitFor(() => assert.ok(screen.getByText('1 / 5')));

    await user.click(screen.getByRole('button', { name: 'Next page' }));
    unmount();

    await waitFor(() => {
      const patch = fetchCalls.find(
        (c) => c.url === '/api/comics/issues/9/progress' && c.init?.method === 'PATCH'
      );
      assert.ok(patch, 'expected unmount to flush the pending save');
    });
  });

  it('shows a PDF fallback message with a download link when the page API 400s', async () => {
    pagesResponse = { ok: false, status: 400, body: { error: 'PDF issues are not paginated by this API' } };

    render(<ComicReader issueId={9} volumeTitle="Sandman" issueNumber="1" onClose={() => {}} />);

    await waitFor(() => {
      assert.ok(screen.getByText(/This issue is a PDF/));
    });
    const link = screen.getByRole('link', { name: /download file/i });
    assert.strictEqual(link.getAttribute('href'), '/api/comics/issues/9/file');
  });

  it('flushes a pending save when the close button is used', async () => {
    const onClose = mock.fn();
    const user = userEvent.setup();
    render(<ComicReader issueId={9} volumeTitle="Sandman" issueNumber="1" onClose={onClose} />);
    await waitFor(() => assert.ok(screen.getByText('1 / 5')));

    await user.click(screen.getByRole('button', { name: 'Next page' }));
    await user.click(screen.getByLabelText('Close reader'));

    await waitFor(() => {
      const patch = fetchCalls.find(
        (c) => c.url === '/api/comics/issues/9/progress' && c.init?.method === 'PATCH'
      );
      assert.ok(patch, 'expected the close button to flush the pending save');
    });
    assert.strictEqual(onClose.mock.callCount(), 1);
  });
});
