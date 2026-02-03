/**
 * Unit tests for GlobalSearch component
 * Tests search functionality, dropdown behavior, and external API integration
 */

import { describe, it, mock, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import '../../../tests/setup-react.js';
import { render, screen, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { GlobalSearch } from '../../../components/GlobalSearch.js';

// Mock data
const mockLocalResults = [
  {
    type: 'book' as const,
    id: 1,
    title: 'Test Book',
    subtitle: 'Test Author',
    coverUrl: 'https://example.com/cover.jpg',
    href: '/books/1',
  },
  {
    type: 'author' as const,
    id: 2,
    title: 'Test Author',
    subtitle: '5 works',
    href: '/authors/2',
  },
  {
    type: 'series' as const,
    id: 'Test Series',
    title: 'Test Series',
    subtitle: '3 books',
    href: '/series/Test%20Series',
  },
];

const mockHardcoverResults = [
  {
    hardcoverId: 'hc-1',
    title: 'Hardcover Book',
    author: 'Hardcover Author',
    coverUrl: 'https://example.com/hc-cover.jpg',
    publishYear: '2024',
    description: 'A book from Hardcover',
  },
];

// Mock router
const mockPush = mock.fn();
const mockRefresh = mock.fn();
const mockRouter = {
  push: mockPush,
  refresh: mockRefresh,
  replace: () => {},
  prefetch: () => {},
  back: () => {},
  pathname: '/',
  route: '/',
  query: {},
  asPath: '/',
};

// Mock search actions
const mockSearchLocal = mock.fn(async () => mockLocalResults);
const mockSearchHardcover = mock.fn(async () => mockHardcoverResults);
const mockAddToWanted = mock.fn(async () => ({ success: true }));

// Apply mocks
mock.module('../../../node_modules/next/navigation.js', () => ({
  useRouter: () => mockRouter,
}));

mock.module('../../../lib/actions/search.js', () => ({
  searchLocal: mockSearchLocal,
  searchHardcover: mockSearchHardcover,
}));

mock.module('../../../lib/actions/wanted.js', () => ({
  addToWanted: mockAddToWanted,
}));

describe('GlobalSearch Component', () => {
  beforeEach(() => {
    mockSearchLocal.mock.resetCalls();
    mockSearchHardcover.mock.resetCalls();
    mockAddToWanted.mock.resetCalls();
    mockPush.mock.resetCalls();
    mockRefresh.mock.resetCalls();
    mock.timers.enable({ apis: ['setTimeout'] });
  });

  afterEach(() => {
    mock.timers.reset();
  });

  describe('Rendering', () => {
    it('should render search input', () => {
      render(<GlobalSearch />);

      const input = screen.getByPlaceholderText('Search books, authors...');
      assert.ok(input);
    });

    it('should render search icon', () => {
      render(<GlobalSearch />);

      const svg = document.querySelector('svg');
      assert.ok(svg);
    });

    it('should not show dropdown initially', () => {
      render(<GlobalSearch />);

      const dropdown = document.querySelector('.absolute.top-full');
      assert.strictEqual(dropdown, null);
    });

    it('should have correct input type', () => {
      render(<GlobalSearch />);

      const input = screen.getByPlaceholderText('Search books, authors...') as HTMLInputElement;
      assert.strictEqual(input.type, 'text');
    });
  });

  describe('Input Handling', () => {
    it('should update query on input change', async () => {
      render(<GlobalSearch />);

      const user = userEvent.setup();
      const input = screen.getByPlaceholderText('Search books, authors...') as HTMLInputElement;

      await user.type(input, 'test');

      assert.strictEqual(input.value, 'test');
    });

    it('should show dropdown when typing', async () => {
      render(<GlobalSearch />);

      const user = userEvent.setup();
      const input = screen.getByPlaceholderText('Search books, authors...');

      await user.type(input, 'te');

      await waitFor(() => {
        const dropdown = document.querySelector('.absolute.top-full');
        assert.ok(dropdown);
      });
    });

    it('should not search with less than 2 characters', async () => {
      render(<GlobalSearch />);

      const user = userEvent.setup();
      const input = screen.getByPlaceholderText('Search books, authors...');

      await user.type(input, 't');

      // Advance timers for debounce
      mock.timers.tick(300);

      assert.strictEqual(mockSearchLocal.mock.callCount(), 0);
    });

    it('should show dropdown when input is focused', async () => {
      render(<GlobalSearch />);

      const user = userEvent.setup();
      const input = screen.getByPlaceholderText('Search books, authors...');

      await user.type(input, 'test');
      mock.timers.tick(300);

      await waitFor(() => {
        const dropdown = document.querySelector('.absolute.top-full');
        assert.ok(dropdown);
      });
    });
  });

  describe('Debounced Search', () => {
    it('should debounce search requests', async () => {
      render(<GlobalSearch />);

      const user = userEvent.setup();
      const input = screen.getByPlaceholderText('Search books, authors...');

      await user.type(input, 't');
      await user.type(input, 'e');
      await user.type(input, 's');
      await user.type(input, 't');

      // Should not have searched yet
      assert.strictEqual(mockSearchLocal.mock.callCount(), 0);

      // Advance timer past debounce delay
      mock.timers.tick(300);

      await waitFor(() => {
        assert.strictEqual(mockSearchLocal.mock.callCount(), 1);
      });
    });

    it('should call searchLocal with correct query', async () => {
      render(<GlobalSearch />);

      const user = userEvent.setup();
      const input = screen.getByPlaceholderText('Search books, authors...');

      await user.type(input, 'test query');
      mock.timers.tick(300);

      await waitFor(() => {
        assert.strictEqual(mockSearchLocal.mock.calls[0].arguments[0], 'test query');
      });
    });

    it('should show loading spinner during search', async () => {
      render(<GlobalSearch />);

      const user = userEvent.setup();
      const input = screen.getByPlaceholderText('Search books, authors...');

      await user.type(input, 'te');
      mock.timers.tick(300);

      await waitFor(() => {
        const spinner = document.querySelector('.animate-spin');
        assert.ok(spinner);
      });
    });
  });

  describe('Local Results Display', () => {
    it('should display local search results', async () => {
      render(<GlobalSearch />);

      const user = userEvent.setup();
      const input = screen.getByPlaceholderText('Search books, authors...');

      await user.type(input, 'test');
      mock.timers.tick(300);

      await waitFor(() => {
        assert.ok(screen.getByText('Test Book'));
        assert.ok(screen.getByText('Test Author'));
        assert.ok(screen.getByText('Test Series'));
      });
    });

    it('should display "In Your Library" header for local results', async () => {
      render(<GlobalSearch />);

      const user = userEvent.setup();
      const input = screen.getByPlaceholderText('Search books, authors...');

      await user.type(input, 'test');
      mock.timers.tick(300);

      await waitFor(() => {
        assert.ok(screen.getByText('In Your Library'));
      });
    });

    it('should display book with cover image', async () => {
      render(<GlobalSearch />);

      const user = userEvent.setup();
      const input = screen.getByPlaceholderText('Search books, authors...');

      await user.type(input, 'test');
      mock.timers.tick(300);

      await waitFor(() => {
        const img = document.querySelector('img[alt=""]');
        assert.ok(img);
        assert.strictEqual((img as HTMLImageElement).src, 'https://example.com/cover.jpg');
      });
    });

    it('should display fallback icon when no cover available', async () => {
      mockSearchLocal.mock.mockImplementation(async () => [
        {
          type: 'book',
          id: 1,
          title: 'No Cover Book',
          subtitle: 'Author',
          href: '/books/1',
        },
      ]);

      render(<GlobalSearch />);

      const user = userEvent.setup();
      const input = screen.getByPlaceholderText('Search books, authors...');

      await user.type(input, 'test');
      mock.timers.tick(300);

      await waitFor(() => {
        const fallback = document.querySelector('.bg-shelvarr-bg.rounded');
        assert.ok(fallback);
      });
    });

    it('should display subtitle for results', async () => {
      render(<GlobalSearch />);

      const user = userEvent.setup();
      const input = screen.getByPlaceholderText('Search books, authors...');

      await user.type(input, 'test');
      mock.timers.tick(300);

      await waitFor(() => {
        assert.ok(screen.getByText('5 works'));
        assert.ok(screen.getByText('3 books'));
      });
    });

    it('should display result type label', async () => {
      render(<GlobalSearch />);

      const user = userEvent.setup();
      const input = screen.getByPlaceholderText('Search books, authors...');

      await user.type(input, 'test');
      mock.timers.tick(300);

      await waitFor(() => {
        const types = Array.from(document.querySelectorAll('.capitalize'))
          .map(el => el.textContent);
        assert.ok(types.includes('book'));
        assert.ok(types.includes('author'));
        assert.ok(types.includes('series'));
      });
    });
  });

  describe('Result Selection', () => {
    it('should navigate to result when clicked', async () => {
      render(<GlobalSearch />);

      const user = userEvent.setup();
      const input = screen.getByPlaceholderText('Search books, authors...');

      await user.type(input, 'test');
      mock.timers.tick(300);

      await waitFor(() => {
        assert.ok(screen.getByText('Test Book'));
      });

      const result = screen.getByText('Test Book').closest('button') as HTMLElement;
      await user.click(result);

      assert.strictEqual(mockPush.mock.callCount(), 1);
      assert.strictEqual(mockPush.mock.calls[0].arguments[0], '/books/1');
    });

    it('should close dropdown after selecting result', async () => {
      render(<GlobalSearch />);

      const user = userEvent.setup();
      const input = screen.getByPlaceholderText('Search books, authors...');

      await user.type(input, 'test');
      mock.timers.tick(300);

      await waitFor(() => {
        assert.ok(screen.getByText('Test Book'));
      });

      const result = screen.getByText('Test Book').closest('button') as HTMLElement;
      await user.click(result);

      await waitFor(() => {
        const dropdown = document.querySelector('.absolute.top-full');
        assert.strictEqual(dropdown, null);
      });
    });

    it('should clear query after selecting result', async () => {
      render(<GlobalSearch />);

      const user = userEvent.setup();
      const input = screen.getByPlaceholderText('Search books, authors...') as HTMLInputElement;

      await user.type(input, 'test');
      mock.timers.tick(300);

      await waitFor(() => {
        assert.ok(screen.getByText('Test Book'));
      });

      const result = screen.getByText('Test Book').closest('button') as HTMLElement;
      await user.click(result);

      await waitFor(() => {
        assert.strictEqual(input.value, '');
      });
    });
  });

  describe('Hardcover Search', () => {
    it('should show "Search Hardcover" button when query length >= 2', async () => {
      render(<GlobalSearch />);

      const user = userEvent.setup();
      const input = screen.getByPlaceholderText('Search books, authors...');

      await user.type(input, 'test');
      mock.timers.tick(300);

      await waitFor(() => {
        assert.ok(screen.getByText(/Search Hardcover for/));
      });
    });

    it('should include query in Hardcover search button text', async () => {
      render(<GlobalSearch />);

      const user = userEvent.setup();
      const input = screen.getByPlaceholderText('Search books, authors...');

      await user.type(input, 'test');
      mock.timers.tick(300);

      await waitFor(() => {
        assert.ok(screen.getByText(/Search Hardcover for "test"/));
      });
    });

    it('should search Hardcover when button is clicked', async () => {
      render(<GlobalSearch />);

      const user = userEvent.setup();
      const input = screen.getByPlaceholderText('Search books, authors...');

      await user.type(input, 'test');
      mock.timers.tick(300);

      await waitFor(() => {
        assert.ok(screen.getByText(/Search Hardcover for/));
      });

      const searchButton = screen.getByText(/Search Hardcover for/).closest('button') as HTMLElement;
      await user.click(searchButton);

      await waitFor(() => {
        assert.strictEqual(mockSearchHardcover.mock.callCount(), 1);
      });
    });

    it('should display Hardcover results', async () => {
      render(<GlobalSearch />);

      const user = userEvent.setup();
      const input = screen.getByPlaceholderText('Search books, authors...');

      await user.type(input, 'test');
      mock.timers.tick(300);

      await waitFor(() => {
        assert.ok(screen.getByText(/Search Hardcover for/));
      });

      const searchButton = screen.getByText(/Search Hardcover for/).closest('button') as HTMLElement;
      await user.click(searchButton);

      await waitFor(() => {
        assert.ok(screen.getByText('Hardcover Book'));
        assert.ok(screen.getByText(/Hardcover Author/));
      });
    });

    it('should display "From Hardcover" header', async () => {
      render(<GlobalSearch />);

      const user = userEvent.setup();
      const input = screen.getByPlaceholderText('Search books, authors...');

      await user.type(input, 'test');
      mock.timers.tick(300);

      await waitFor(() => {
        assert.ok(screen.getByText(/Search Hardcover for/));
      });

      const searchButton = screen.getByText(/Search Hardcover for/).closest('button') as HTMLElement;
      await user.click(searchButton);

      await waitFor(() => {
        assert.ok(screen.getByText('From Hardcover'));
      });
    });

    it('should display publish year in Hardcover results', async () => {
      render(<GlobalSearch />);

      const user = userEvent.setup();
      const input = screen.getByPlaceholderText('Search books, authors...');

      await user.type(input, 'test');
      mock.timers.tick(300);

      await waitFor(() => {
        const searchButton = screen.getByText(/Search Hardcover for/).closest('button') as HTMLElement;
        user.click(searchButton);
      });

      await waitFor(() => {
        assert.ok(screen.getByText(/\(2024\)/));
      });
    });

    it('should hide "Search Hardcover" button after searching', async () => {
      render(<GlobalSearch />);

      const user = userEvent.setup();
      const input = screen.getByPlaceholderText('Search books, authors...');

      await user.type(input, 'test');
      mock.timers.tick(300);

      await waitFor(() => {
        const searchButton = screen.getByText(/Search Hardcover for/).closest('button') as HTMLElement;
        user.click(searchButton);
      });

      await waitFor(() => {
        const searchButton = screen.queryByText(/Search Hardcover for/);
        assert.strictEqual(searchButton, null);
      });
    });
  });

  describe('Add to Wanted', () => {
    it('should display "+ Want" button for Hardcover results', async () => {
      render(<GlobalSearch />);

      const user = userEvent.setup();
      const input = screen.getByPlaceholderText('Search books, authors...');

      await user.type(input, 'test');
      mock.timers.tick(300);

      await waitFor(() => {
        const searchButton = screen.getByText(/Search Hardcover for/).closest('button') as HTMLElement;
        user.click(searchButton);
      });

      await waitFor(() => {
        assert.ok(screen.getByText('+ Want'));
      });
    });

    it('should call addToWanted when "+ Want" is clicked', async () => {
      render(<GlobalSearch />);

      const user = userEvent.setup();
      const input = screen.getByPlaceholderText('Search books, authors...');

      await user.type(input, 'test');
      mock.timers.tick(300);

      await waitFor(() => {
        const searchButton = screen.getByText(/Search Hardcover for/).closest('button') as HTMLElement;
        user.click(searchButton);
      });

      await waitFor(() => {
        assert.ok(screen.getByText('+ Want'));
      });

      const wantButton = screen.getByText('+ Want');
      await user.click(wantButton);

      assert.strictEqual(mockAddToWanted.mock.callCount(), 1);
      assert.deepStrictEqual(mockAddToWanted.mock.calls[0].arguments[0], {
        hardcoverId: 'hc-1',
        title: 'Hardcover Book',
        author: 'Hardcover Author',
        coverUrl: 'https://example.com/hc-cover.jpg',
        description: 'A book from Hardcover',
      });
    });

    it('should show "Adding..." while adding to wanted', async () => {
      let resolveAddToWanted: any;
      mockAddToWanted.mock.mockImplementation(() => new Promise(resolve => {
        resolveAddToWanted = resolve;
      }));

      render(<GlobalSearch />);

      const user = userEvent.setup();
      const input = screen.getByPlaceholderText('Search books, authors...');

      await user.type(input, 'test');
      mock.timers.tick(300);

      await waitFor(() => {
        const searchButton = screen.getByText(/Search Hardcover for/).closest('button') as HTMLElement;
        user.click(searchButton);
      });

      await waitFor(() => {
        const wantButton = screen.getByText('+ Want');
        user.click(wantButton);
      });

      await waitFor(() => {
        assert.ok(screen.getByText('Adding...'));
      });

      resolveAddToWanted({ success: true });
    });

    it('should disable button while adding to wanted', async () => {
      let resolveAddToWanted: any;
      mockAddToWanted.mock.mockImplementation(() => new Promise(resolve => {
        resolveAddToWanted = resolve;
      }));

      render(<GlobalSearch />);

      const user = userEvent.setup();
      const input = screen.getByPlaceholderText('Search books, authors...');

      await user.type(input, 'test');
      mock.timers.tick(300);

      await waitFor(() => {
        const searchButton = screen.getByText(/Search Hardcover for/).closest('button') as HTMLElement;
        user.click(searchButton);
      });

      await waitFor(() => {
        const wantButton = screen.getByText('+ Want') as HTMLButtonElement;
        user.click(wantButton);
      });

      await waitFor(() => {
        const button = screen.getByText('Adding...') as HTMLButtonElement;
        assert.strictEqual(button.disabled, true);
      });

      resolveAddToWanted({ success: true });
    });

    it('should remove book from results after adding to wanted', async () => {
      render(<GlobalSearch />);

      const user = userEvent.setup();
      const input = screen.getByPlaceholderText('Search books, authors...');

      await user.type(input, 'test');
      mock.timers.tick(300);

      await waitFor(() => {
        const searchButton = screen.getByText(/Search Hardcover for/).closest('button') as HTMLElement;
        user.click(searchButton);
      });

      await waitFor(() => {
        assert.ok(screen.getByText('Hardcover Book'));
      });

      const wantButton = screen.getByText('+ Want');
      await user.click(wantButton);

      await waitFor(() => {
        assert.strictEqual(screen.queryByText('Hardcover Book'), null);
      });
    });

    it('should refresh router after adding to wanted', async () => {
      render(<GlobalSearch />);

      const user = userEvent.setup();
      const input = screen.getByPlaceholderText('Search books, authors...');

      await user.type(input, 'test');
      mock.timers.tick(300);

      await waitFor(() => {
        const searchButton = screen.getByText(/Search Hardcover for/).closest('button') as HTMLElement;
        user.click(searchButton);
      });

      await waitFor(() => {
        const wantButton = screen.getByText('+ Want');
        user.click(wantButton);
      });

      await waitFor(() => {
        assert.strictEqual(mockRefresh.mock.callCount(), 1);
      });
    });
  });

  describe('Dropdown Behavior', () => {
    it('should close dropdown when clicking outside', async () => {
      render(
        <div>
          <GlobalSearch />
          <div data-testid="outside">Outside</div>
        </div>
      );

      const user = userEvent.setup();
      const input = screen.getByPlaceholderText('Search books, authors...');

      await user.type(input, 'test');
      mock.timers.tick(300);

      await waitFor(() => {
        const dropdown = document.querySelector('.absolute.top-full');
        assert.ok(dropdown);
      });

      const outside = screen.getByTestId('outside');
      await user.click(outside);

      await waitFor(() => {
        const dropdown = document.querySelector('.absolute.top-full');
        assert.strictEqual(dropdown, null);
      });
    });

    it('should not close dropdown when clicking inside', async () => {
      render(<GlobalSearch />);

      const user = userEvent.setup();
      const input = screen.getByPlaceholderText('Search books, authors...');

      await user.type(input, 'test');
      mock.timers.tick(300);

      await waitFor(() => {
        const dropdown = document.querySelector('.absolute.top-full');
        assert.ok(dropdown);
      });

      const dropdown = document.querySelector('.absolute.top-full') as HTMLElement;
      await user.click(dropdown);

      // Dropdown should still be visible
      const dropdownAfter = document.querySelector('.absolute.top-full');
      assert.ok(dropdownAfter);
    });

    it('should show "No results found" when no results', async () => {
      mockSearchLocal.mock.mockImplementation(async () => []);
      mockSearchHardcover.mock.mockImplementation(async () => []);

      render(<GlobalSearch />);

      const user = userEvent.setup();
      const input = screen.getByPlaceholderText('Search books, authors...');

      await user.type(input, 'test');
      mock.timers.tick(300);

      await waitFor(() => {
        const searchButton = screen.getByText(/Search Hardcover for/).closest('button') as HTMLElement;
        user.click(searchButton);
      });

      await waitFor(() => {
        assert.ok(screen.getByText('No results found'));
      });
    });

    it('should reset Hardcover view when query changes', async () => {
      render(<GlobalSearch />);

      const user = userEvent.setup();
      const input = screen.getByPlaceholderText('Search books, authors...');

      await user.type(input, 'test');
      mock.timers.tick(300);

      await waitFor(() => {
        const searchButton = screen.getByText(/Search Hardcover for/).closest('button') as HTMLElement;
        user.click(searchButton);
      });

      await waitFor(() => {
        assert.ok(screen.getByText('From Hardcover'));
      });

      // Type more
      await user.clear(input);
      await user.type(input, 'new query');

      await waitFor(() => {
        assert.strictEqual(screen.queryByText('From Hardcover'), null);
        assert.ok(screen.getByText(/Search Hardcover for "new query"/));
      });
    });
  });

  describe('Error Handling', () => {
    it('should handle search error gracefully', async () => {
      mockSearchLocal.mock.mockImplementation(async () => {
        throw new Error('Search failed');
      });

      render(<GlobalSearch />);

      const user = userEvent.setup();
      const input = screen.getByPlaceholderText('Search books, authors...');

      await user.type(input, 'test');
      mock.timers.tick(300);

      // Should not crash, results should be empty
      await waitFor(() => {
        const dropdown = document.querySelector('.absolute.top-full');
        assert.ok(dropdown);
      });
    });

    it('should handle addToWanted error gracefully', async () => {
      mockAddToWanted.mock.mockImplementation(async () => {
        throw new Error('Add failed');
      });

      render(<GlobalSearch />);

      const user = userEvent.setup();
      const input = screen.getByPlaceholderText('Search books, authors...');

      await user.type(input, 'test');
      mock.timers.tick(300);

      await waitFor(() => {
        const searchButton = screen.getByText(/Search Hardcover for/).closest('button') as HTMLElement;
        user.click(searchButton);
      });

      await waitFor(() => {
        const wantButton = screen.getByText('+ Want');
        user.click(wantButton);
      });

      // Should not crash
      await waitFor(() => {
        assert.ok(screen.getByText('+ Want'));
      });
    });

    it('should handle Hardcover search error gracefully', async () => {
      mockSearchHardcover.mock.mockImplementation(async () => {
        throw new Error('Hardcover search failed');
      });

      render(<GlobalSearch />);

      const user = userEvent.setup();
      const input = screen.getByPlaceholderText('Search books, authors...');

      await user.type(input, 'test');
      mock.timers.tick(300);

      await waitFor(() => {
        const searchButton = screen.getByText(/Search Hardcover for/).closest('button') as HTMLElement;
        user.click(searchButton);
      });

      // Should not crash
      await waitFor(() => {
        const dropdown = document.querySelector('.absolute.top-full');
        assert.ok(dropdown);
      });
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty query string', async () => {
      render(<GlobalSearch />);

      const user = userEvent.setup();
      const input = screen.getByPlaceholderText('Search books, authors...');

      await user.type(input, '   ');
      mock.timers.tick(300);

      // Should still trigger search (even with spaces)
      await waitFor(() => {
        const dropdown = document.querySelector('.absolute.top-full');
        assert.ok(dropdown);
      });
    });

    it('should handle special characters in query', async () => {
      render(<GlobalSearch />);

      const user = userEvent.setup();
      const input = screen.getByPlaceholderText('Search books, authors...');

      await user.type(input, '<script>alert("xss")</script>');
      mock.timers.tick(300);

      assert.strictEqual(mockSearchLocal.mock.callCount(), 1);
    });

    it('should handle very long query strings', async () => {
      render(<GlobalSearch />);

      const user = userEvent.setup();
      const input = screen.getByPlaceholderText('Search books, authors...');

      const longQuery = 'a'.repeat(1000);
      await user.type(input, longQuery);
      mock.timers.tick(300);

      await waitFor(() => {
        assert.strictEqual(mockSearchLocal.mock.calls[0].arguments[0], longQuery);
      });
    });

    it('should handle results without subtitles', async () => {
      mockSearchLocal.mock.mockImplementation(async () => [
        {
          type: 'book',
          id: 1,
          title: 'No Subtitle Book',
          href: '/books/1',
        },
      ]);

      render(<GlobalSearch />);

      const user = userEvent.setup();
      const input = screen.getByPlaceholderText('Search books, authors...');

      await user.type(input, 'test');
      mock.timers.tick(300);

      await waitFor(() => {
        assert.ok(screen.getByText('No Subtitle Book'));
      });
    });

    it('should handle Hardcover results without author', async () => {
      mockSearchHardcover.mock.mockImplementation(async () => [
        {
          hardcoverId: 'hc-1',
          title: 'No Author Book',
          coverUrl: 'https://example.com/cover.jpg',
        },
      ]);

      render(<GlobalSearch />);

      const user = userEvent.setup();
      const input = screen.getByPlaceholderText('Search books, authors...');

      await user.type(input, 'test');
      mock.timers.tick(300);

      await waitFor(() => {
        const searchButton = screen.getByText(/Search Hardcover for/).closest('button') as HTMLElement;
        user.click(searchButton);
      });

      await waitFor(() => {
        assert.ok(screen.getByText('No Author Book'));
      });
    });

    it('should handle rapid query changes', async () => {
      render(<GlobalSearch />);

      const user = userEvent.setup();
      const input = screen.getByPlaceholderText('Search books, authors...');

      await user.type(input, 'first');
      await user.clear(input);
      await user.type(input, 'second');
      await user.clear(input);
      await user.type(input, 'third');

      mock.timers.tick(300);

      await waitFor(() => {
        // Should only search for the last query
        assert.strictEqual(mockSearchLocal.mock.calls[mockSearchLocal.mock.callCount() - 1].arguments[0], 'third');
      });
    });
  });
});
