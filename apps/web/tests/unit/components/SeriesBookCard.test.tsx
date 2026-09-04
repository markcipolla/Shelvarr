/**
 * Unit tests for SeriesBookCard component
 *
 * Covers the Want button on missing books: a book already on the wanted list
 * must say so instead of offering a button whose only outcome is a silent
 * no-op, and a genuine failure must be visible rather than swallowed.
 */

import { describe, it, mock, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import '../../../tests/setup-react.js';
import { render, screen, waitFor, cleanup } from '@testing-library/react';
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

mock.module('next/image', {
  namedExports: {},
  defaultExport: (props: any) => {
    const { fill, sizes, ...rest } = props;
    return <img {...rest} />;
  },
});

mock.module('next/link', {
  namedExports: {},
  defaultExport: ({ children, href, ...rest }: any) => (
    <a href={href} {...rest}>{children}</a>
  ),
});

const mockAddToWanted = mock.fn(async () => ({ success: true, id: 1 }) as any);

mock.module('../../../lib/actions/wanted.js', {
  namedExports: { addToWanted: mockAddToWanted },
});

const { SeriesBookCard } = await import('../../../components/series/SeriesBookCard.js');

const missingBook = {
  inLibrary: false,
  hardcoverId: 'hc-42',
  title: 'The Well of Ascension',
  authors: 'Brandon Sanderson',
  position: 2,
  coverUrl: 'https://example.com/cover.jpg',
  isWanted: false,
};

describe('SeriesBookCard Component', () => {
  beforeEach(() => {
    mockRefresh.mock.resetCalls();
    mockAddToWanted.mock.resetCalls();
    mockAddToWanted.mock.mockImplementation(async () => ({ success: true, id: 1 }));
  });

  afterEach(() => {
    cleanup();
  });

  it('adds a missing book to the wanted list when Want is pressed', async () => {
    const user = userEvent.setup();
    render(<SeriesBookCard book={missingBook} />);

    await user.click(screen.getByRole('button', { name: '+ Want' }));

    await waitFor(() => assert.strictEqual(mockAddToWanted.mock.callCount(), 1));
    assert.deepStrictEqual(mockAddToWanted.mock.calls[0]?.arguments[0], {
      hardcoverId: 'hc-42',
      title: 'The Well of Ascension',
      author: 'Brandon Sanderson',
      coverUrl: 'https://example.com/cover.jpg',
    });
    await waitFor(() => assert.ok(screen.getByText('✓ Added to Wanted')));
    assert.strictEqual(mockRefresh.mock.callCount(), 1);
  });

  it('shows a book that is already wanted as added, with no Want button', () => {
    render(<SeriesBookCard book={{ ...missingBook, isWanted: true }} />);

    assert.ok(screen.getByText('✓ Added to Wanted'));
    assert.strictEqual(screen.queryByRole('button', { name: '+ Want' }), null);
  });

  it('treats an "already wanted" response as added rather than a failure', async () => {
    mockAddToWanted.mock.mockImplementation(async () => ({
      success: false,
      alreadyWanted: true,
      error: 'Book is already on wanted list',
    }));

    const user = userEvent.setup();
    render(<SeriesBookCard book={missingBook} />);

    await user.click(screen.getByRole('button', { name: '+ Want' }));

    await waitFor(() => assert.ok(screen.getByText('✓ Added to Wanted')));
    assert.strictEqual(screen.queryByRole('alert'), null);
  });

  it('surfaces a failure instead of silently doing nothing', async () => {
    mockAddToWanted.mock.mockImplementation(async () => ({
      success: false,
      error: 'Failed to add book',
    }));

    const user = userEvent.setup();
    render(<SeriesBookCard book={missingBook} />);

    await user.click(screen.getByRole('button', { name: '+ Want' }));

    await waitFor(() => assert.ok(screen.getByRole('alert')));
    assert.strictEqual(screen.getByRole('alert').textContent, 'Failed to add book');
    // Still offers a retry rather than locking the card into a dead state.
    assert.ok(screen.getByRole('button', { name: '+ Want' }));
  });

  it('links owned books to their detail page instead of showing Want', () => {
    render(
      <SeriesBookCard
        book={{ ...missingBook, inLibrary: true, libraryBookId: 7 }}
      />
    );

    assert.strictEqual(screen.queryByRole('button', { name: '+ Want' }), null);
    assert.strictEqual(screen.getByRole('link').getAttribute('href'), '/books/7');
  });
});
