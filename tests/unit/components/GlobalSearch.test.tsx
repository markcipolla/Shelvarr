/**
 * Unit tests for GlobalSearch component
 * Tests search functionality, dropdown behavior, and navigation to search page
 */

import { describe, it, mock, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import '../../../tests/setup-react.js';
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';

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

// Apply mocks before importing the component
mock.module('next/navigation', {
  namedExports: { useRouter: () => mockRouter },
});

mock.module('../../../lib/actions/search.js', {
  namedExports: { searchLocal: mockSearchLocal },
});

// Dynamic import after mocks are set up
const { GlobalSearch } = await import('../../../components/GlobalSearch.js');

describe('GlobalSearch Component', () => {
  beforeEach(() => {
    mockSearchLocal.mock.resetCalls();
    mockSearchLocal.mock.mockImplementation(async () => mockLocalResults);
    mockPush.mock.resetCalls();
    mockRefresh.mock.resetCalls();
  });

  afterEach(() => {
    cleanup();
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

      // Wait past debounce delay
      await new Promise(resolve => setTimeout(resolve, 400));

      assert.strictEqual(mockSearchLocal.mock.callCount(), 0);
    });

    it('should show dropdown when input is focused', async () => {
      render(<GlobalSearch />);

      const user = userEvent.setup();
      const input = screen.getByPlaceholderText('Search books, authors...');

      await user.type(input, 'test');

      await waitFor(() => {
        const dropdown = document.querySelector('.absolute.top-full');
        assert.ok(dropdown);
      });
    });
  });

  describe('Debounced Search', () => {
    it('should call searchLocal after debounce delay', async () => {
      render(<GlobalSearch />);

      const user = userEvent.setup();
      const input = screen.getByPlaceholderText('Search books, authors...');

      await user.type(input, 'test');

      // Wait for 300ms debounce to fire
      await new Promise(resolve => setTimeout(resolve, 500));
      assert.ok(mockSearchLocal.mock.callCount() >= 1);
    });

    it('should call searchLocal with correct query', async () => {
      render(<GlobalSearch />);

      const user = userEvent.setup();
      const input = screen.getByPlaceholderText('Search books, authors...');

      await user.type(input, 'test query');

      await waitFor(() => {
        assert.strictEqual(mockSearchLocal.mock.calls[0].arguments[0], 'test query');
      });
    });

    it('should show loading spinner during search', async () => {
      // Make mock slow so we can catch the loading state
      mockSearchLocal.mock.mockImplementation(
        () => new Promise(resolve => setTimeout(() => resolve(mockLocalResults), 500))
      );

      render(<GlobalSearch />);

      const user = userEvent.setup();
      const input = screen.getByPlaceholderText('Search books, authors...');

      await user.type(input, 'te');

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

      await waitFor(() => {
        assert.ok(screen.getByText('Test Book'));
        // "Test Author" appears as both book subtitle and author title
        assert.ok(screen.getAllByText('Test Author').length >= 1);
        assert.ok(screen.getByText('Test Series'));
      });
    });

    it('should display "In Your Library" header for local results', async () => {
      render(<GlobalSearch />);

      const user = userEvent.setup();
      const input = screen.getByPlaceholderText('Search books, authors...');

      await user.type(input, 'test');

      await waitFor(() => {
        assert.ok(screen.getByText('In Your Library'));
      });
    });

    it('should display book with cover image', async () => {
      render(<GlobalSearch />);

      const user = userEvent.setup();
      const input = screen.getByPlaceholderText('Search books, authors...');

      await user.type(input, 'test');

      // Wait for debounce + render
      await waitFor(() => {
        assert.ok(screen.getByText('Test Book'));
      });

      const img = document.querySelector('img') as HTMLImageElement;
      assert.ok(img);
      assert.strictEqual(img.src, 'https://example.com/cover.jpg');
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

      // Wait for results to render
      await waitFor(() => {
        assert.ok(screen.getByText('No Cover Book'));
      });

      // No img tag should be present since there's no cover
      const img = document.querySelector('img');
      assert.strictEqual(img, null);
    });

    it('should display subtitle for results', async () => {
      render(<GlobalSearch />);

      const user = userEvent.setup();
      const input = screen.getByPlaceholderText('Search books, authors...');

      await user.type(input, 'test');

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

  describe('Hardcover Search Navigation', () => {
    it('should show "Search Hardcover" button when query length >= 2', async () => {
      render(<GlobalSearch />);

      const user = userEvent.setup();
      const input = screen.getByPlaceholderText('Search books, authors...');

      await user.type(input, 'test');

      await waitFor(() => {
        assert.ok(screen.getByText(/Search Hardcover for/));
      });
    });

    it('should include query in Hardcover search button text', async () => {
      render(<GlobalSearch />);

      const user = userEvent.setup();
      const input = screen.getByPlaceholderText('Search books, authors...');

      await user.type(input, 'test');

      await waitFor(() => {
        assert.ok(screen.getByText(/Search Hardcover for/));
        // The text includes "test" in the button
        const button = screen.getByText(/Search Hardcover for/).closest('button');
        assert.ok(button?.textContent?.includes('test'));
      });
    });

    it('should navigate to /search when Hardcover button is clicked', async () => {
      render(<GlobalSearch />);

      const user = userEvent.setup();
      const input = screen.getByPlaceholderText('Search books, authors...');

      await user.type(input, 'test');

      await waitFor(() => {
        assert.ok(screen.getByText(/Search Hardcover for/));
      });

      const searchButton = screen.getByText(/Search Hardcover for/).closest('button') as HTMLElement;
      await user.click(searchButton);

      assert.strictEqual(mockPush.mock.callCount(), 1);
      assert.strictEqual(mockPush.mock.calls[0].arguments[0], '/search?q=test');
    });

    it('should close dropdown after navigating to search page', async () => {
      render(<GlobalSearch />);

      const user = userEvent.setup();
      const input = screen.getByPlaceholderText('Search books, authors...');

      await user.type(input, 'test');

      await waitFor(() => {
        assert.ok(screen.getByText(/Search Hardcover for/));
      });

      const searchButton = screen.getByText(/Search Hardcover for/).closest('button') as HTMLElement;
      await user.click(searchButton);

      await waitFor(() => {
        const dropdown = document.querySelector('.absolute.top-full');
        assert.strictEqual(dropdown, null);
      });
    });

    it('should clear query after navigating to search page', async () => {
      render(<GlobalSearch />);

      const user = userEvent.setup();
      const input = screen.getByPlaceholderText('Search books, authors...') as HTMLInputElement;

      await user.type(input, 'test');

      await waitFor(() => {
        assert.ok(screen.getByText(/Search Hardcover for/));
      });

      const searchButton = screen.getByText(/Search Hardcover for/).closest('button') as HTMLElement;
      await user.click(searchButton);

      await waitFor(() => {
        assert.strictEqual(input.value, '');
      });
    });

    it('should encode special characters in search URL', async () => {
      render(<GlobalSearch />);

      const user = userEvent.setup();
      const input = screen.getByPlaceholderText('Search books, authors...');

      await user.type(input, 'test & query');

      await waitFor(() => {
        assert.ok(screen.getByText(/Search Hardcover for/));
      });

      const searchButton = screen.getByText(/Search Hardcover for/).closest('button') as HTMLElement;
      await user.click(searchButton);

      assert.strictEqual(mockPush.mock.calls[0].arguments[0], '/search?q=test%20%26%20query');
    });

    it('should show description text under Hardcover search button', async () => {
      render(<GlobalSearch />);

      const user = userEvent.setup();
      const input = screen.getByPlaceholderText('Search books, authors...');

      await user.type(input, 'test');

      await waitFor(() => {
        assert.ok(screen.getByText('Find books to add to your wanted list'));
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

    it('should show "No local results found" when no local results', async () => {
      mockSearchLocal.mock.mockImplementation(async () => []);

      render(<GlobalSearch />);

      const user = userEvent.setup();
      const input = screen.getByPlaceholderText('Search books, authors...');

      await user.type(input, 'test');

      await waitFor(() => {
        assert.ok(screen.getByText('No local results found'));
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

      // Should not crash, dropdown should still be visible
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

      await waitFor(() => {
        assert.ok(mockSearchLocal.mock.callCount() >= 1);
      }, { timeout: 3000 });
    });

    it('should handle very long query strings', async () => {
      render(<GlobalSearch />);

      const user = userEvent.setup();
      const input = screen.getByPlaceholderText('Search books, authors...');

      const longQuery = 'a'.repeat(1000);
      await user.type(input, longQuery);

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

      await waitFor(() => {
        assert.ok(screen.getByText('No Subtitle Book'));
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


      await waitFor(() => {
        // Should only search for the last query
        assert.strictEqual(mockSearchLocal.mock.calls[mockSearchLocal.mock.callCount() - 1].arguments[0], 'third');
      });
    });
  });
});
