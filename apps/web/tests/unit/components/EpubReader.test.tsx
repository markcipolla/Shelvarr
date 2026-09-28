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
 *
 * Also covers the reader polish added in E3-5: preferences that live on the
 * account rather than the browser, the stylesheet they turn into inside the
 * book's own iframe, keyboard page-turning from both the page and the book's
 * iframe, hiding the header, and the progress/time-remaining figures that
 * epub.js's generated locations make possible.
 *
 * Also covers the offline book cache (E3-6): a cache hit renders instantly
 * and still refreshes from the network in the background; a cache miss
 * falls back to the network as before when online; and a cache miss with no
 * network shows a clear message instead of a spinner that never resolves.
 */

import { describe, it, mock, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import 'fake-indexeddb/auto';
import '../../../tests/setup-react.js';
import { render, waitFor, cleanup, act, screen, fireEvent } from '@testing-library/react';
import { putCachedBlob, epubCacheKey } from '../../../lib/offline/bookCache.js';

interface CapturedProps {
  location: string | number;
  locationChanged: (cfi: string) => void;
  handleKeyPress?: (event?: KeyboardEvent) => void;
  handleTextSelected?: (cfiRange: string) => void;
  getRendition?: (rendition: unknown) => void;
  searchQuery?: string;
  onSearchResults?: (results: Array<{ cfi: string; excerpt: string }>) => void;
}

let capturedProps: CapturedProps | null = null;

/**
 * A rendition for the component to be handed on the next render, or null for
 * "this test doesn't care about epub.js".
 *
 * Opt-in rather than always-on, because handing one over changes real
 * behaviour: locations get generated, and the reader starts reporting a true
 * reading percentage instead of the 0 it sends before it knows anything.
 */
let renditionToHandOver: FakeRendition | null = null;

mock.module('react-reader', {
  namedExports: {
    ReactReader: (props: any) => {
      capturedProps = props;
      if (renditionToHandOver && props.getRendition) {
        const rendition = renditionToHandOver;
        // react-reader hands the rendition over exactly once, at init.
        renditionToHandOver = null;
        props.getRendition(rendition);
      }
      return null;
    },
  },
});

/** Six locations across three chapters, matching the shape epub.js produces. */
const FAKE_LOCATIONS = [
  'epubcfi(/6/2!/4/2/1:0)',
  'epubcfi(/6/2!/4/8/1:0)',
  'epubcfi(/6/4!/4/2/1:0)',
  'epubcfi(/6/4!/4/6/1:0)',
  'epubcfi(/6/4!/4/9/1:0)',
  'epubcfi(/6/6!/4/2/1:0)',
];

interface FakeRendition {
  injectedCss: string[];
  turns: string[];
  highlighted: string[];
  themes: { registerCss: (name: string, css: string) => void };
  on: (event: string, handler: (...args: unknown[]) => void) => void;
  next: () => Promise<void>;
  prev: () => Promise<void>;
  getRange: (cfi: string) => { toString: () => string };
  annotations: {
    highlight: (cfi: string) => void;
    remove: (cfi: string) => void;
  };
  book: {
    ready: Promise<void>;
    locations: {
      generate: (chars: number) => Promise<string[]>;
      locationFromCfi: (cfi: string) => number;
    };
  };
}

function makeFakeRendition(locations: string[] = FAKE_LOCATIONS): FakeRendition {
  const rendition: FakeRendition = {
    injectedCss: [],
    turns: [],
    highlighted: [],
    themes: {
      registerCss: (_name: string, css: string) => {
        rendition.injectedCss.push(css);
      },
    },
    on: () => {},
    next: async () => {
      rendition.turns.push('next');
    },
    prev: async () => {
      rendition.turns.push('prev');
    },
    getRange: () => ({ toString: () => 'a passage worth keeping' }),
    annotations: {
      highlight: (cfi: string) => {
        rendition.highlighted.push(cfi);
      },
      remove: (cfi: string) => {
        rendition.highlighted = rendition.highlighted.filter((c) => c !== cfi);
      },
    },
    book: {
      ready: Promise.resolve(),
      locations: {
        generate: async () => locations,
        locationFromCfi: (cfi: string) => locations.indexOf(cfi),
      },
    },
  };
  return rendition;
}

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
let preferencesResponse: unknown = null;
let annotationsResponse: unknown[] = [];
let nextAnnotationId = 1;
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

    if (url.includes('/api/reader/preferences')) {
      return { ok: true, json: async () => preferencesResponse } as Response;
    }

    if (url.includes('/annotations')) {
      const method = init?.method ?? 'GET';
      if (method === 'POST') {
        const sent = JSON.parse(init!.body as string);
        return {
          ok: true,
          json: async () => ({
            id: nextAnnotationId++,
            bookId: 7,
            kind: sent.kind,
            cfi: sent.cfi,
            text: sent.text ?? null,
            colour: null,
            created: '2026-09-17T10:00:00.000Z',
          }),
        } as Response;
      }
      if (method === 'DELETE') {
        return { ok: true, json: async () => ({ deleted: true }) } as Response;
      }
      return { ok: true, json: async () => annotationsResponse } as Response;
    }

    return { ok: true, json: async () => ({}) } as Response;
  }) as typeof fetch;
}

function resetFetchState() {
  capturedProps = null;
  renditionToHandOver = null;
  fetchCalls = [];
  progressionResponse = { ok: true, body: null };
  preferencesResponse = null;
  annotationsResponse = [];
  nextAnnotationId = 1;
  installFetchMock();
}

describe('EpubReader Component', () => {
  beforeEach(() => {
    resetFetchState();
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
      // Zero because epub.js never handed this test a rendition, so no
      // locations exist to measure against yet. The real figure is covered
      // in 'EpubReader progress and time remaining' below.
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

/**
 * Flips navigator.onLine for the duration of an (async) callback, then
 * restores it. Awaits the callback before restoring — otherwise the restore
 * would run before the callback's own awaited work (rendering, waitFor)
 * ever observes the flipped value.
 */
async function withOnlineState<T>(online: boolean, fn: () => T | Promise<T>): Promise<T> {
  const original = Object.getOwnPropertyDescriptor(globalThis.navigator, 'onLine');
  Object.defineProperty(globalThis.navigator, 'onLine', { value: online, configurable: true });
  try {
    return await fn();
  } finally {
    if (original) Object.defineProperty(globalThis.navigator, 'onLine', original);
  }
}

describe('EpubReader offline caching', () => {
  beforeEach(() => {
    resetFetchState();
  });

  afterEach(() => {
    cleanup();
    globalThis.fetch = originalFetch;
    mock.timers.reset();
  });

  it('renders instantly from a cached copy, and still refreshes from the network in the background', async () => {
    const cachedBook = { ...book, id: 101 };
    await putCachedBlob(
      epubCacheKey(101),
      new Blob(['cached epub bytes'], { type: 'application/epub+zip' })
    );

    let releaseFetch: () => void = () => {};
    const fetchGate = new Promise<void>((resolve) => {
      releaseFetch = resolve;
    });

    globalThis.fetch = (async (url: string, init?: RequestInit) => {
      fetchCalls.push({ url, init });
      if (url.includes('/file')) {
        // Block the network response so the test can prove the cached copy
        // rendered before this ever resolves.
        await fetchGate;
        return { ok: true, arrayBuffer: async () => new ArrayBuffer(4) } as unknown as Response;
      }
      if (url.includes('/progression')) {
        const method = init?.method ?? 'GET';
        return { ok: true, json: async () => (method === 'GET' ? null : null) } as Response;
      }
      return { ok: true, json: async () => ({}) } as Response;
    }) as typeof fetch;

    render(<EpubReader book={cachedBook} onClose={() => {}} />);

    // The cached copy renders without waiting on the (still-blocked) network call.
    await waitFor(() => assert.ok(capturedProps));

    // The background refresh fetch was still made.
    await waitFor(() => {
      assert.ok(fetchCalls.some((c) => c.url === '/api/books/101/file'));
    });

    releaseFetch();
  });

  it('falls back to a fresh network fetch when there is no cached copy and the browser is online', async () => {
    const freshBook = { ...book, id: 102 };
    render(<EpubReader book={freshBook} onClose={() => {}} />);

    await waitFor(() => assert.ok(capturedProps));
    assert.ok(fetchCalls.some((c) => c.url === '/api/books/102/file'));
  });

  it('shows a clear message instead of a spinner when there is no cached copy and no network', async () => {
    const offlineBook = { ...book, id: 103 };

    await withOnlineState(false, async () => {
      const { getByText, queryByText } = render(<EpubReader book={offlineBook} onClose={() => {}} />);

      await waitFor(() => {
        assert.ok(getByText(/isn.t available offline/i));
      });

      // Never falls back to a network fetch while offline.
      assert.ok(!fetchCalls.some((c) => c.url === '/api/books/103/file'));
      // And doesn't get stuck showing the loading spinner.
      assert.strictEqual(queryByText('Loading book...'), null);
    });
  });
});

/**
 * Dispatches a key the way the browser would, on the page itself.
 *
 * Keys pressed inside the book's iframe arrive by a different road — through
 * react-reader's `handleKeyPress` prop — and the tests below check both,
 * because a reader where the arrow keys work everywhere except on the words
 * is a reader where the arrow keys don't work.
 */
function pressKey(key: string, init: KeyboardEventInit = {}) {
  act(() => {
    document.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, ...init }));
  });
}

describe('EpubReader display preferences', () => {
  beforeEach(() => {
    resetFetchState();
  });

  afterEach(() => {
    cleanup();
    globalThis.fetch = originalFetch;
    mock.timers.reset();
  });

  it('reads preferences from the account, not from this browser', async () => {
    render(<EpubReader book={book} onClose={() => {}} />);

    await waitFor(() => {
      assert.ok(fetchCalls.some((c) => c.url === '/api/reader/preferences'));
    });

    // No book id and no device id in the URL: these follow the person.
    const call = fetchCalls.find((c) => c.url === '/api/reader/preferences');
    assert.strictEqual(call?.init?.method ?? undefined, undefined);
  });

  it('pushes the saved preferences into the book’s own stylesheet', async () => {
    preferencesResponse = { theme: 'dark', typeface: 'serif', fontSizePercent: 130 };
    const rendition = makeFakeRendition();
    renditionToHandOver = rendition;

    render(<EpubReader book={book} onClose={() => {}} />);

    await waitFor(() => {
      const css = rendition.injectedCss.join('\n');
      assert.match(css, /font-size: 130% !important/);
      assert.match(css, /#15171c/);
      assert.match(css, /Georgia/);
    });
  });

  it('saves a changed setting back to the account', async () => {
    render(<EpubReader book={book} onClose={() => {}} />);
    await waitFor(() => assert.ok(fetchCalls.some((c) => c.url === '/api/reader/preferences')));

    act(() => {
      screen.getByLabelText('Display settings').click();
    });
    act(() => {
      screen.getByLabelText('Increase text size').click();
    });

    // Applied to the screen immediately...
    assert.ok(screen.getByText('110%'));

    // ...and written back to the account once the burst of clicks settles.
    await waitFor(
      () => {
        const put = fetchCalls.find(
          (c) => c.url === '/api/reader/preferences' && c.init?.method === 'PUT'
        );
        assert.ok(put, 'expected the change to be saved');
        assert.strictEqual(JSON.parse(put!.init!.body as string).fontSizePercent, 110);
      },
      { timeout: 3000 }
    );
  });

  it('hides the header without hiding the way out', async () => {
    preferencesResponse = { hideHeader: true };
    render(<EpubReader book={book} onClose={() => {}} />);

    await waitFor(() => assert.ok(screen.queryByLabelText('Show the header')));
    // The title bar is gone...
    assert.strictEqual(screen.queryByText('The Final Empire'), null);
    // ...but closing the reader never is.
    assert.ok(screen.getByLabelText('Close reader'));

    act(() => {
      screen.getByLabelText('Show the header').click();
    });
    assert.ok(screen.getByText('The Final Empire'));
  });

  it('toggles the header from the keyboard', async () => {
    render(<EpubReader book={book} onClose={() => {}} />);
    await waitFor(() => assert.ok(capturedProps));

    assert.ok(screen.getByText('The Final Empire'));
    pressKey('h');
    assert.strictEqual(screen.queryByText('The Final Empire'), null);
    pressKey('h');
    assert.ok(screen.getByText('The Final Empire'));
  });
});

describe('EpubReader keyboard navigation', () => {
  beforeEach(() => {
    resetFetchState();
  });

  afterEach(() => {
    cleanup();
    globalThis.fetch = originalFetch;
    mock.timers.reset();
  });

  it('turns pages with the arrow keys, page keys and space', async () => {
    const rendition = makeFakeRendition();
    renditionToHandOver = rendition;
    render(<EpubReader book={book} onClose={() => {}} />);
    await waitFor(() => assert.ok(capturedProps));

    pressKey('ArrowRight');
    pressKey('ArrowLeft');
    pressKey('PageDown');
    pressKey('PageUp');
    pressKey(' ');
    pressKey(' ', { shiftKey: true });

    assert.deepStrictEqual(rendition.turns, ['next', 'prev', 'next', 'prev', 'next', 'prev']);
  });

  it('turns pages for keys pressed inside the book’s own iframe too', async () => {
    const rendition = makeFakeRendition();
    renditionToHandOver = rendition;
    render(<EpubReader book={book} onClose={() => {}} />);
    await waitFor(() => assert.ok(capturedProps?.handleKeyPress));

    act(() => {
      capturedProps!.handleKeyPress!(new KeyboardEvent('keyup', { key: 'ArrowRight' }));
    });
    assert.deepStrictEqual(rendition.turns, ['next']);
  });

  it('leaves modified keys to the browser', async () => {
    const rendition = makeFakeRendition();
    renditionToHandOver = rendition;
    render(<EpubReader book={book} onClose={() => {}} />);
    await waitFor(() => assert.ok(capturedProps));

    pressKey('ArrowRight', { metaKey: true });
    pressKey('ArrowLeft', { ctrlKey: true });
    assert.deepStrictEqual(rendition.turns, []);
  });

  it('does not hijack keys typed into the search box', async () => {
    const rendition = makeFakeRendition();
    renditionToHandOver = rendition;
    render(<EpubReader book={book} onClose={() => {}} />);
    await waitFor(() => assert.ok(capturedProps));

    act(() => {
      screen.getByLabelText('Bookmarks, highlights and search').click();
    });
    const input = screen.getByLabelText('Search this book');
    act(() => {
      input.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'b', bubbles: true }));
    });

    assert.deepStrictEqual(rendition.turns, []);
    assert.ok(
      !fetchCalls.some((c) => c.url.includes('/annotations') && c.init?.method === 'POST'),
      'typing "b" into a search box must not drop a bookmark'
    );
  });

  it('closes an open panel on Escape before closing the reader', async () => {
    const onClose = mock.fn();
    render(<EpubReader book={book} onClose={onClose} />);
    await waitFor(() => assert.ok(capturedProps));

    act(() => {
      screen.getByLabelText('Display settings').click();
    });
    assert.ok(screen.queryByText('Display'));

    pressKey('Escape');
    assert.strictEqual(onClose.mock.callCount(), 0, 'Escape should close the panel first');

    pressKey('Escape');
    assert.strictEqual(onClose.mock.callCount(), 1);
  });
});

describe('EpubReader progress and time remaining', () => {
  beforeEach(() => {
    resetFetchState();
  });

  afterEach(() => {
    cleanup();
    globalThis.fetch = originalFetch;
    mock.timers.reset();
  });

  it('says nothing until epub.js has worked out where things are', async () => {
    render(<EpubReader book={book} onClose={() => {}} />);
    await waitFor(() => assert.ok(capturedProps));
    assert.ok(screen.getByText('Working out where you are…'));
  });

  it('reports progress through the book and time left in the chapter', async () => {
    renditionToHandOver = makeFakeRendition();
    render(<EpubReader book={book} onClose={() => {}} />);
    await waitFor(() => assert.ok(capturedProps));

    // The fourth of six locations, and the second of its chapter's three.
    act(() => {
      capturedProps!.locationChanged('epubcfi(/6/4!/4/6/1:0)');
    });

    await waitFor(() => {
      assert.ok(screen.getByText('60% through the book'));
      assert.match(screen.getByText(/left in this chapter/).textContent ?? '', /about|less than/);
    });
  });

  it('sends a real reading percentage once it has one', async () => {
    renditionToHandOver = makeFakeRendition();
    render(<EpubReader book={book} onClose={() => {}} />);
    await waitFor(() => assert.ok(capturedProps));

    act(() => {
      capturedProps!.locationChanged('epubcfi(/6/6!/4/2/1:0)');
    });

    await waitFor(
      () => {
        const put = fetchCalls.find(
          (c) => c.url === '/api/books/7/progression' && c.init?.method === 'PUT'
        );
        assert.ok(put, 'expected a save');
        // Last of six locations: finished, which is what lets the Hardcover
        // completion sync fire at all.
        assert.strictEqual(JSON.parse(put!.init!.body as string).progression, 1);
      },
      { timeout: 4000 }
    );
  });
});

describe('EpubReader bookmarks, highlights and search', () => {
  beforeEach(() => {
    resetFetchState();
  });

  afterEach(() => {
    cleanup();
    globalThis.fetch = originalFetch;
    mock.timers.reset();
  });

  it('loads the marks already saved against this book', async () => {
    annotationsResponse = [
      {
        id: 3,
        bookId: 7,
        kind: 'bookmark',
        cfi: 'epubcfi(/6/2!/4/2/1:0)',
        text: 'Chapter One',
        colour: null,
        created: '2026-09-16T10:00:00.000Z',
      },
    ];
    render(<EpubReader book={book} onClose={() => {}} />);
    await waitFor(() => assert.ok(capturedProps));

    act(() => {
      screen.getByLabelText('Bookmarks, highlights and search').click();
    });
    await waitFor(() => assert.ok(screen.getByText('Chapter One')));
  });

  it('bookmarks the current spot from the keyboard, and takes it back', async () => {
    renditionToHandOver = makeFakeRendition();
    render(<EpubReader book={book} onClose={() => {}} />);
    await waitFor(() => assert.ok(capturedProps));

    act(() => {
      capturedProps!.locationChanged('epubcfi(/6/4!/4/2/1:0)');
    });

    pressKey('b');
    await waitFor(() => {
      const post = fetchCalls.find(
        (c) => c.url === '/api/books/7/annotations' && c.init?.method === 'POST'
      );
      assert.ok(post, 'expected a bookmark to be saved');
      const body = JSON.parse(post!.init!.body as string);
      assert.strictEqual(body.kind, 'bookmark');
      assert.strictEqual(body.cfi, 'epubcfi(/6/4!/4/2/1:0)');
    });

    // The header button now offers to take it away again.
    await waitFor(() => assert.ok(screen.queryByLabelText('Remove bookmark')));

    pressKey('b');
    await waitFor(() => {
      assert.ok(
        fetchCalls.some(
          (c) => c.url.includes('/annotations?annotationId=') && c.init?.method === 'DELETE'
        )
      );
    });
  });

  it('offers to keep a selected passage, and draws it once kept', async () => {
    const rendition = makeFakeRendition();
    renditionToHandOver = rendition;
    render(<EpubReader book={book} onClose={() => {}} />);
    await waitFor(() => assert.ok(capturedProps?.handleTextSelected));

    act(() => {
      capturedProps!.handleTextSelected!('epubcfi(/6/4!/4/2/1:0,/1:5,/1:40)');
    });
    assert.ok(screen.getByText('a passage worth keeping'));

    act(() => {
      screen.getByText('Highlight').click();
    });

    await waitFor(() => {
      assert.deepStrictEqual(rendition.highlighted, ['epubcfi(/6/4!/4/2/1:0,/1:5,/1:40)']);
    });
  });

  it('hands a search to epub.js and shows what comes back', async () => {
    renditionToHandOver = makeFakeRendition();
    render(<EpubReader book={book} onClose={() => {}} />);
    await waitFor(() => assert.ok(capturedProps));

    act(() => {
      screen.getByLabelText('Bookmarks, highlights and search').click();
    });

    const input = screen.getByLabelText('Search this book');
    fireEvent.change(input, { target: { value: 'mistborn' } });
    act(() => {
      screen.getByText('Find').click();
    });

    await waitFor(() => assert.strictEqual(capturedProps?.searchQuery, 'mistborn'));

    act(() => {
      capturedProps!.onSearchResults!([
        { cfi: 'epubcfi(/6/4!/4/2/1:0)', excerpt: 'the mistborn walked' },
      ]);
    });

    assert.ok(screen.getByText(/the mistborn walked/));
  });
});
