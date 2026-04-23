/**
 * Unit tests for GlobalSearch component
 * Tests input handling, debounced navigation to /search, and clear button behavior.
 */

import { describe, it, mock, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import '../../../tests/setup-react.js';
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';

// Mock router state (mutable across tests)
const mockPush = mock.fn();
const mockReplace = mock.fn();
let mockPathname = '/';
let mockSearchParams = new URLSearchParams();

mock.module('next/navigation', {
  namedExports: {
    useRouter: () => ({
      push: mockPush,
      replace: mockReplace,
      refresh: () => {},
      prefetch: () => {},
      back: () => {},
    }),
    usePathname: () => mockPathname,
    useSearchParams: () => mockSearchParams,
  },
});

const { GlobalSearch } = await import('../../../components/GlobalSearch.js');

describe('GlobalSearch Component', () => {
  beforeEach(() => {
    mockPush.mock.resetCalls();
    mockReplace.mock.resetCalls();
    mockPathname = '/';
    mockSearchParams = new URLSearchParams();
  });

  afterEach(() => {
    cleanup();
  });

  describe('Rendering', () => {
    it('should render search input', () => {
      render(<GlobalSearch />);
      const input = screen.getByPlaceholderText('Search books, comics, authors...');
      assert.ok(input);
    });

    it('should not render clear button when query is empty', () => {
      render(<GlobalSearch />);
      const clearButton = screen.queryByLabelText('Clear search');
      assert.strictEqual(clearButton, null);
    });

    it('should render clear button when query has text', async () => {
      render(<GlobalSearch />);
      const user = userEvent.setup();
      const input = screen.getByPlaceholderText('Search books, comics, authors...');

      await user.type(input, 'foo');

      const clearButton = screen.getByLabelText('Clear search');
      assert.ok(clearButton);
    });
  });

  describe('Typing navigates to /search', () => {
    it('should navigate to /search after debounce when typing on non-search route', async () => {
      render(<GlobalSearch />);
      const user = userEvent.setup();
      const input = screen.getByPlaceholderText('Search books, comics, authors...');

      await user.type(input, 'harry');
      await new Promise((r) => setTimeout(r, 400));

      assert.ok(mockPush.mock.callCount() >= 1);
      const lastCall = mockPush.mock.calls[mockPush.mock.callCount() - 1];
      assert.strictEqual(lastCall.arguments[0], '/search?q=harry');
    });

    it('should use replace (not push) when already on /search', async () => {
      mockPathname = '/search';
      render(<GlobalSearch />);
      const user = userEvent.setup();
      const input = screen.getByPlaceholderText('Search books, comics, authors...');

      await user.type(input, 'xy');
      await new Promise((r) => setTimeout(r, 400));

      assert.ok(mockReplace.mock.callCount() >= 1);
      const last = mockReplace.mock.calls[mockReplace.mock.callCount() - 1];
      assert.strictEqual(last.arguments[0], '/search?q=xy');
      assert.strictEqual(mockPush.mock.callCount(), 0);
    });

    it('should URL-encode the query', async () => {
      render(<GlobalSearch />);
      const user = userEvent.setup();
      const input = screen.getByPlaceholderText('Search books, comics, authors...');

      await user.type(input, 'a&b');
      await new Promise((r) => setTimeout(r, 400));

      assert.ok(mockPush.mock.callCount() >= 1);
      const last = mockPush.mock.calls[mockPush.mock.callCount() - 1];
      assert.strictEqual(last.arguments[0], '/search?q=a%26b');
    });
  });

  describe('Clear button', () => {
    it('should clear input when clicked', async () => {
      render(<GlobalSearch />);
      const user = userEvent.setup();
      const input = screen.getByPlaceholderText('Search books, comics, authors...') as HTMLInputElement;

      await user.type(input, 'hello');
      assert.strictEqual(input.value, 'hello');

      const clearButton = screen.getByLabelText('Clear search');
      await user.click(clearButton);

      assert.strictEqual(input.value, '');
    });

    it('should replace to bare /search when cleared while on /search', async () => {
      mockPathname = '/search';
      mockSearchParams = new URLSearchParams('q=hello');
      render(<GlobalSearch />);
      const user = userEvent.setup();

      await waitFor(() => {
        const input = screen.getByPlaceholderText('Search books, comics, authors...') as HTMLInputElement;
        assert.strictEqual(input.value, 'hello');
      });

      mockReplace.mock.resetCalls();
      const clearButton = screen.getByLabelText('Clear search');
      await user.click(clearButton);

      assert.ok(mockReplace.mock.callCount() >= 1);
      assert.strictEqual(mockReplace.mock.calls[0].arguments[0], '/search');
    });
  });

  describe('URL sync', () => {
    it('should initialize input from ?q= when on /search', () => {
      mockPathname = '/search';
      mockSearchParams = new URLSearchParams('q=initial');
      render(<GlobalSearch />);
      const input = screen.getByPlaceholderText('Search books, comics, authors...') as HTMLInputElement;
      assert.strictEqual(input.value, 'initial');
    });

    it('should not initialize input from URL when not on /search', () => {
      mockPathname = '/books';
      mockSearchParams = new URLSearchParams('q=shouldNotAppear');
      render(<GlobalSearch />);
      const input = screen.getByPlaceholderText('Search books, comics, authors...') as HTMLInputElement;
      assert.strictEqual(input.value, '');
    });
  });
});
