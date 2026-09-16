/**
 * Unit tests for BookActions component
 *
 * Covers the completion toggle: a book that isn't finished offers "Mark as
 * completed", one that is offers "Mark as incomplete", and each flips to the
 * other once the server accepts the change. The saved page travels with both
 * requests so toggling never loses the reader's place.
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

mock.module('../../../lib/actions/books.js', {
  namedExports: { deleteBook: mock.fn() },
});

mock.module('../../../components/books/MetadataSearchModal.js', {
  namedExports: { MetadataSearchModal: () => null },
});

let capturedEpubProps: Record<string, unknown> | null = null;
mock.module('../../../components/books/EpubReader.js', {
  namedExports: {
    EpubReader: (props: any) => {
      capturedEpubProps = props;
      return <div data-testid="epub-reader" />;
    },
  },
});

let capturedPageReaderProps: Record<string, unknown> | null = null;
mock.module('../../../components/books/BookPageReader.js', {
  namedExports: {
    BookPageReader: (props: any) => {
      capturedPageReaderProps = props;
      return <div data-testid="book-page-reader" />;
    },
  },
});

let capturedPdfReaderProps: Record<string, unknown> | null = null;
mock.module('../../../components/books/PdfReader.js', {
  namedExports: {
    PdfReader: (props: any) => {
      capturedPdfReaderProps = props;
      return <div data-testid="pdf-reader" />;
    },
  },
});

mock.module('../../../components/ui/Toast.js', {
  namedExports: {
    useToast: () => ({ success: mockToastSuccess, error: mockToastError }),
  },
});

const { BookActions } = await import('../../../components/books/BookActions.js');

const book = {
  id: 7,
  title: 'The Final Empire',
  filePath: '/books/the-final-empire.pdf',
  metadataSource: null,
} as any;

type FetchCall = { url: string; init: RequestInit };
let fetchCalls: FetchCall[] = [];
let fetchResponse: { ok: boolean; body: unknown } = { ok: true, body: {} };
const originalFetch = globalThis.fetch;

describe('BookActions Component', () => {
  beforeEach(() => {
    fetchCalls = [];
    fetchResponse = { ok: true, body: {} };
    mockRefresh.mock.resetCalls();
    mockToastSuccess.mock.resetCalls();
    mockToastError.mock.resetCalls();
    capturedEpubProps = null;
    capturedPageReaderProps = null;
    capturedPdfReaderProps = null;
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

  it('offers Mark as completed for an unfinished book', () => {
    render(<BookActions book={book} readProgress={{ page: 12, completed: false }} />);

    assert.ok(screen.getByRole('button', { name: 'Mark as completed' }));
    assert.strictEqual(screen.queryByRole('button', { name: 'Mark as incomplete' }), null);
  });

  it('offers Mark as incomplete for a finished book', () => {
    render(<BookActions book={book} readProgress={{ page: 300, completed: true }} />);

    assert.ok(screen.getByRole('button', { name: 'Mark as incomplete' }));
    assert.strictEqual(screen.queryByRole('button', { name: 'Mark as completed' }), null);
  });

  it('flips to Mark as incomplete once marked completed, keeping the page', async () => {
    const user = userEvent.setup();
    render(<BookActions book={book} readProgress={{ page: 12, completed: false }} />);

    await user.click(screen.getByRole('button', { name: 'Mark as completed' }));

    await waitFor(() => assert.ok(screen.getByRole('button', { name: 'Mark as incomplete' })));
    assert.strictEqual(fetchCalls.length, 1);
    assert.strictEqual(fetchCalls[0]?.url, '/api/books/7/read-progress');
    assert.strictEqual(fetchCalls[0]?.init.method, 'PATCH');
    assert.deepStrictEqual(JSON.parse(fetchCalls[0]?.init.body as string), {
      page: 12,
      completed: true,
    });
    assert.strictEqual(mockToastSuccess.mock.calls[0]?.arguments[0], 'Marked as completed');
    assert.strictEqual(mockRefresh.mock.callCount(), 1);
  });

  it('flips back to Mark as completed once marked incomplete', async () => {
    const user = userEvent.setup();
    render(<BookActions book={book} readProgress={{ page: 300, completed: true }} />);

    await user.click(screen.getByRole('button', { name: 'Mark as incomplete' }));

    await waitFor(() => assert.ok(screen.getByRole('button', { name: 'Mark as completed' })));
    assert.deepStrictEqual(JSON.parse(fetchCalls[0]?.init.body as string), {
      page: 300,
      completed: false,
    });
    assert.strictEqual(mockToastSuccess.mock.calls[0]?.arguments[0], 'Marked as incomplete');
  });

  it('treats a book with no progress as unfinished', () => {
    render(<BookActions book={book} />);

    assert.ok(screen.getByRole('button', { name: 'Mark as completed' }));
  });

  it('keeps the current label and reports the error when the server refuses', async () => {
    fetchResponse = { ok: false, body: { error: 'Book not found' } };
    const user = userEvent.setup();
    render(<BookActions book={book} readProgress={{ page: 300, completed: true }} />);

    await user.click(screen.getByRole('button', { name: 'Mark as incomplete' }));

    await waitFor(() => assert.strictEqual(mockToastError.mock.callCount(), 1));
    assert.strictEqual(mockToastError.mock.calls[0]?.arguments[0], 'Book not found');
    assert.ok(screen.getByRole('button', { name: 'Mark as incomplete' }));
    assert.strictEqual(mockRefresh.mock.callCount(), 0);
  });
});

describe('BookActions reader selection', () => {
  beforeEach(() => {
    fetchCalls = [];
    fetchResponse = { ok: true, body: {} };
    capturedEpubProps = null;
    capturedPageReaderProps = null;
    capturedPdfReaderProps = null;
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

  it('opens EpubReader for a .epub file', async () => {
    const epubBook = { id: 1, title: 'A Novel', filePath: '/books/a-novel.epub', metadataSource: null } as any;
    const user = userEvent.setup();
    render(<BookActions book={epubBook} readProgress={{ page: 0, completed: false }} />);

    await user.click(screen.getByRole('button', { name: /Read/ }));

    assert.ok(screen.getByTestId('epub-reader'));
    assert.strictEqual(screen.queryByTestId('book-page-reader'), null);
    assert.strictEqual(screen.queryByTestId('pdf-reader'), null);
    assert.strictEqual(capturedEpubProps?.book, epubBook);
  });

  it('opens BookPageReader for a .cbz file, passing readProgress through', async () => {
    const cbzBook = { id: 2, title: 'Sandman Vol. 1', filePath: '/books/sandman-01.cbz', metadataSource: null } as any;
    const progress = { page: 4, completed: false };
    const user = userEvent.setup();
    render(<BookActions book={cbzBook} readProgress={progress} />);

    await user.click(screen.getByRole('button', { name: /Read/ }));

    assert.ok(screen.getByTestId('book-page-reader'));
    assert.strictEqual(screen.queryByTestId('epub-reader'), null);
    assert.strictEqual(screen.queryByTestId('pdf-reader'), null);
    assert.strictEqual(capturedPageReaderProps?.book, cbzBook);
    assert.deepStrictEqual(capturedPageReaderProps?.readProgress, progress);
  });

  it('opens BookPageReader for a .cbr file', async () => {
    const cbrBook = { id: 3, title: 'Sandman Vol. 2', filePath: '/books/sandman-02.cbr', metadataSource: null } as any;
    const user = userEvent.setup();
    render(<BookActions book={cbrBook} />);

    await user.click(screen.getByRole('button', { name: /Read/ }));

    assert.ok(screen.getByTestId('book-page-reader'));
  });

  it('opens PdfReader for a .pdf file', async () => {
    const pdfBook = { id: 4, title: 'The Mistborn Codex', filePath: '/books/mistborn-codex.pdf', metadataSource: null } as any;
    const user = userEvent.setup();
    render(<BookActions book={pdfBook} />);

    await user.click(screen.getByRole('button', { name: /Read/ }));

    assert.ok(screen.getByTestId('pdf-reader'));
    assert.strictEqual(screen.queryByTestId('epub-reader'), null);
    assert.strictEqual(screen.queryByTestId('book-page-reader'), null);
    assert.strictEqual(capturedPdfReaderProps?.book, pdfBook);
  });

  it('shows no Read button for an unsupported extension', () => {
    const mobiBook = { id: 5, title: 'Old Format', filePath: '/books/old-format.mobi', metadataSource: null } as any;
    render(<BookActions book={mobiBook} />);

    assert.strictEqual(screen.queryByRole('button', { name: /Read/ }), null);
  });
});
