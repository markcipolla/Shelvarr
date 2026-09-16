/**
 * Unit tests for EpubReader component
 *
 * Covers keeping reading position across sessions and devices: on open, the
 * reader fetches the latest saved progression (across all of this person's
 * devices) and resumes there instead of always opening at the cover; as the
 * reader moves through the book, the new position is saved back — debounced
 * while turning pages, and flushed immediately when the reader closes so a
 * quick close-after-turn doesn't lose the debounce window's worth of
 * progress.
 */

import { describe, it, mock, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import '../../../tests/setup-react.js';
import { render, waitFor, cleanup } from '@testing-library/react';

let capturedProps: { location: string | number; locationChanged: (cfi: string) => void } | null = null;

mock.module('react-reader', {
  namedExports: {
    ReactReader: (props: any) => {
      capturedProps = props;
      return null;
    },
  },
});

const { EpubReader } = await import('../../../components/books/EpubReader.js');

const book = {
  id: 7,
  title: 'The Final Empire',
  filePath: '/books/the-final-empire.epub',
  metadataSource: null,
} as any;

type FetchCall = { url: string; init?: RequestInit };
let fetchCalls: FetchCall[] = [];
let progressionResponse: { ok: boolean; body: unknown } = { ok: true, body: null };
const originalFetch = globalThis.fetch;

function installFetchMock() {
  globalThis.fetch = (async (url: string, init?: RequestInit) => {
    fetchCalls.push({ url, init });

    if (url.includes('/file')) {
      return {
        ok: true,
        arrayBuffer: async () => new ArrayBuffer(8),
      } as unknown as Response;
    }

    if (url.includes('/progression')) {
      const method = init?.method ?? 'GET';
      if (method === 'GET') {
        return {
          ok: progressionResponse.ok,
          json: async () => progressionResponse.body,
        } as Response;
      }
      // PUT
      return {
        ok: true,
        json: async () => null,
      } as Response;
    }

    return { ok: true, json: async () => ({}) } as Response;
  }) as typeof fetch;
}

describe('EpubReader Component', () => {
  beforeEach(() => {
    capturedProps = null;
    fetchCalls = [];
    progressionResponse = { ok: true, body: null };
    installFetchMock();
  });

  afterEach(() => {
    cleanup();
    globalThis.fetch = originalFetch;
    mock.timers.reset();
  });

  it('fetches the latest progression across devices on mount', async () => {
    render(<EpubReader book={book} onClose={() => {}} />);

    await waitFor(() => {
      assert.ok(fetchCalls.some((c) => c.url === '/api/books/7/progression'));
    });

    // No device_id — resuming should consider every device, not just 'web'.
    const progressionGet = fetchCalls.find((c) => c.url === '/api/books/7/progression');
    assert.strictEqual(progressionGet?.init?.method ?? undefined, undefined);
  });

  it('restores the location from a locator saved on another device', async () => {
    progressionResponse = {
      ok: true,
      body: {
        bookId: '7',
        deviceId: 'phone',
        locator: 'epubcfi(/6/14!/4/2/1:0)',
        progression: 0.42,
        created: '2026-09-01T00:00:00.000Z',
        lastModified: '2026-09-01T00:00:00.000Z',
      },
    };

    render(<EpubReader book={book} onClose={() => {}} />);

    await waitFor(() => {
      assert.strictEqual(capturedProps?.location, 'epubcfi(/6/14!/4/2/1:0)');
    });
  });

  it('opens at the start when there is no saved progression', async () => {
    render(<EpubReader book={book} onClose={() => {}} />);

    await waitFor(() => {
      assert.ok(capturedProps);
    });
    assert.strictEqual(capturedProps?.location, 0);
  });

  it('debounces a PUT after the location changes, using a fixed web device id', async () => {
    render(<EpubReader book={book} onClose={() => {}} />);
    await waitFor(() => assert.ok(capturedProps));

    // Fake timers are only enabled once mount's own async work (which relies
    // on real promise microtasks, not timers) has already settled, so
    // waitFor's internal polling isn't starved by the mocked clock.
    mock.timers.enable({ apis: ['setTimeout'] });
    try {
      capturedProps!.locationChanged('epubcfi(/6/20!/4/4/2:10)');

      // Not sent immediately.
      assert.strictEqual(
        fetchCalls.filter((c) => c.url === '/api/books/7/progression' && c.init?.method === 'PUT').length,
        0
      );

      mock.timers.tick(2000);
      await Promise.resolve();
      await Promise.resolve();

      const put = fetchCalls.find(
        (c) => c.url === '/api/books/7/progression' && c.init?.method === 'PUT'
      );
      assert.ok(put, 'expected a debounced PUT to be sent');
      const body = JSON.parse(put!.init!.body as string);
      assert.strictEqual(body.deviceId, 'web');
      assert.strictEqual(body.locator, JSON.stringify('epubcfi(/6/20!/4/4/2:10)'));
      // Documented scope cut for this card — see the comment in EpubReader.tsx.
      assert.strictEqual(body.progression, 0);
    } finally {
      mock.timers.reset();
    }
  });

  it('flushes a pending save on unmount instead of losing it to the debounce window', async () => {
    const { unmount } = render(<EpubReader book={book} onClose={() => {}} />);

    await waitFor(() => assert.ok(capturedProps));
    capturedProps!.locationChanged('epubcfi(/6/30!/4/6/2:5)');

    unmount();

    await waitFor(() => {
      const put = fetchCalls.find(
        (c) => c.url === '/api/books/7/progression' && c.init?.method === 'PUT'
      );
      assert.ok(put, 'expected unmount to flush the pending save');
    });
  });

  it('flushes a pending save when the close button is used', async () => {
    const onClose = mock.fn();
    const { getByLabelText } = render(<EpubReader book={book} onClose={onClose} />);

    await waitFor(() => assert.ok(capturedProps));
    capturedProps!.locationChanged('epubcfi(/6/40!/4/8/2:5)');

    getByLabelText('Close reader').click();

    await waitFor(() => {
      const put = fetchCalls.find(
        (c) => c.url === '/api/books/7/progression' && c.init?.method === 'PUT'
      );
      assert.ok(put, 'expected the close button to flush the pending save');
    });
    assert.strictEqual(onClose.mock.callCount(), 1);
  });
});
