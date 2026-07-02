/**
 * Unit tests for SearchPage component
 * Tests search form, results display, add to wanted, and configuration states
 */

import { describe, it, mock, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import '../../../tests/setup-react.js';
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';

// Mock data
const mockResults = [
  {
    hardcoverId: 'hc-1',
    title: 'The Great Gatsby',
    author: 'F. Scott Fitzgerald',
    coverUrl: 'https://example.com/gatsby.jpg',
    publishYear: '1925',
    description: 'A novel about the American dream',
    isWanted: false,
  },
  {
    hardcoverId: 'hc-2',
    title: 'To Kill a Mockingbird',
    author: 'Harper Lee',
    coverUrl: 'https://example.com/mockingbird.jpg',
    publishYear: '1960',
    description: 'A novel about racial injustice',
    isWanted: true,
  },
  {
    hardcoverId: 'hc-3',
    title: 'No Cover Book',
    author: 'Unknown Author',
    publishYear: '2020',
    isWanted: false,
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
};

// Mock addToWanted
const mockAddToWanted = mock.fn(async () => ({ success: true, id: 1 }));

// Apply mocks before importing
mock.module('next/navigation', {
  namedExports: { useRouter: () => mockRouter },
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

mock.module('../../../lib/actions/wanted.js', {
  namedExports: { addToWanted: mockAddToWanted },
});

// Dynamic import after mocks
const { SearchPage } = await import('../../../components/search/SearchPage.js');

describe('SearchPage Component', () => {
  beforeEach(() => {
    mockPush.mock.resetCalls();
    mockRefresh.mock.resetCalls();
    mockAddToWanted.mock.resetCalls();
    mockAddToWanted.mock.mockImplementation(async () => ({ success: true, id: 1 }));
  });

  afterEach(() => {
    cleanup();
  });

  describe('Rendering', () => {
    it('should render page title', () => {
      render(<SearchPage initialQuery="" initialResults={[]} isConfigured={true} />);

      assert.ok(screen.getByRole('heading', { name: 'Search' }));
    });

    it('should render search form with input and button', () => {
      render(<SearchPage initialQuery="" initialResults={[]} isConfigured={true} />);

      assert.ok(screen.getByPlaceholderText('Search by title, author, ISBN...'));
      assert.ok(screen.getByRole('button', { name: 'Search' }));
    });

    it('should pre-fill input with initial query', () => {
      render(<SearchPage initialQuery="gatsby" initialResults={[]} isConfigured={true} />);

      const input = screen.getByPlaceholderText('Search by title, author, ISBN...') as HTMLInputElement;
      assert.strictEqual(input.value, 'gatsby');
    });

    it('should disable search button when query is empty', () => {
      render(<SearchPage initialQuery="" initialResults={[]} isConfigured={true} />);

      const button = screen.getByRole('button', { name: 'Search' }) as HTMLButtonElement;
      assert.strictEqual(button.disabled, true);
    });
  });

  describe('Configuration Warning', () => {
    it('should show warning when Hardcover is not configured', () => {
      render(<SearchPage initialQuery="" initialResults={[]} isConfigured={false} />);

      assert.ok(screen.getByText('Hardcover API key not configured'));
    });

    it('should show link to settings when not configured', () => {
      render(<SearchPage initialQuery="" initialResults={[]} isConfigured={false} />);

      const link = screen.getByText('Go to Settings →') as HTMLAnchorElement;
      assert.ok(link);
      assert.strictEqual(link.getAttribute('href'), '/settings');
    });

    it('should not show warning when configured', () => {
      render(<SearchPage initialQuery="" initialResults={[]} isConfigured={true} />);

      const warning = screen.queryByText('Hardcover API key not configured');
      assert.strictEqual(warning, null);
    });
  });

  describe('Empty States', () => {
    it('should show empty state message when no query and configured', () => {
      render(<SearchPage initialQuery="" initialResults={[]} isConfigured={true} />);

      assert.ok(screen.getByText('Enter a search term above to find books and comics in your library or on Hardcover'));
    });

    it('should show no results message when query has no results', () => {
      render(<SearchPage initialQuery="nonexistent" initialResults={[]} isConfigured={true} />);

      assert.ok(screen.getByText(/No results found for/));
    });

    it('should not show empty state when not configured', () => {
      render(<SearchPage initialQuery="" initialResults={[]} isConfigured={false} />);

      const empty = screen.queryByText('Enter a search term above to find books and comics in your library or on Hardcover');
      assert.strictEqual(empty, null);
    });
  });

  describe('Results Display', () => {
    it('should display result titles', () => {
      render(<SearchPage initialQuery="test" initialResults={mockResults} isConfigured={true} />);

      assert.ok(screen.getByText('The Great Gatsby'));
      assert.ok(screen.getByText('To Kill a Mockingbird'));
      assert.ok(screen.getByText('No Cover Book'));
    });

    it('should display authors with publish year', () => {
      render(<SearchPage initialQuery="test" initialResults={mockResults} isConfigured={true} />);

      assert.ok(screen.getByText('F. Scott Fitzgerald (1925)'));
      assert.ok(screen.getByText('Harper Lee (1960)'));
    });

    it('should display cover images when available', () => {
      render(<SearchPage initialQuery="test" initialResults={mockResults} isConfigured={true} />);

      const images = document.querySelectorAll('img');
      // Two results have covers
      const coverImages = Array.from(images).filter(
        img => img.src.includes('example.com')
      );
      assert.strictEqual(coverImages.length, 2);
    });

    it('should show "+ Want" button for non-wanted books', () => {
      render(<SearchPage initialQuery="test" initialResults={mockResults} isConfigured={true} />);

      const wantButtons = screen.getAllByText('+ Want');
      // hc-1 and hc-3 are not wanted
      assert.strictEqual(wantButtons.length, 2);
    });

    it('should show "Already Wanted" for wanted books', () => {
      render(<SearchPage initialQuery="test" initialResults={mockResults} isConfigured={true} />);

      assert.ok(screen.getByText('Already Wanted'));
    });

    it('should link "Already Wanted" to /wanted', () => {
      render(<SearchPage initialQuery="test" initialResults={mockResults} isConfigured={true} />);

      const link = screen.getByText('Already Wanted') as HTMLAnchorElement;
      assert.strictEqual(link.getAttribute('href'), '/wanted');
    });
  });

  describe('Add to Wanted', () => {
    it('should call addToWanted when "+ Want" is clicked', async () => {
      render(<SearchPage initialQuery="test" initialResults={mockResults} isConfigured={true} />);

      const user = userEvent.setup();
      const wantButtons = screen.getAllByText('+ Want');
      await user.click(wantButtons[0]);

      await waitFor(() => {
        assert.strictEqual(mockAddToWanted.mock.callCount(), 1);
      });

      const callArgs = mockAddToWanted.mock.calls[0].arguments[0];
      assert.strictEqual(callArgs.hardcoverId, 'hc-1');
      assert.strictEqual(callArgs.title, 'The Great Gatsby');
    });

    it('should show "Adding..." while adding to wanted', async () => {
      // Hold addToWanted open with a manually-controlled promise so we can
      // observe the pending state, then settle it before the test ends. Using a
      // timer here would leave a deferred router.refresh() firing after cleanup,
      // leaking into later tests (e.g. "should refresh router after successful add").
      let resolveAdd!: (value: { success: boolean; id: number }) => void;
      mockAddToWanted.mock.mockImplementation(
        () => new Promise(resolve => {
          resolveAdd = resolve;
        })
      );

      render(<SearchPage initialQuery="test" initialResults={mockResults} isConfigured={true} />);

      const user = userEvent.setup();
      const wantButtons = screen.getAllByText('+ Want');
      await user.click(wantButtons[0]);

      await waitFor(() => {
        assert.ok(screen.getByText('Adding...'));
      });

      // Settle the add and wait for the component to finish so no pending work
      // (including router.refresh) leaks past cleanup into subsequent tests.
      resolveAdd({ success: true, id: 1 });
      await waitFor(() => {
        assert.ok(screen.getAllByText('Already Wanted').length >= 1);
      });
    });

    it('should show "Already Wanted" after successful add', async () => {
      render(<SearchPage initialQuery="test" initialResults={mockResults} isConfigured={true} />);

      const user = userEvent.setup();
      const wantButtons = screen.getAllByText('+ Want');
      await user.click(wantButtons[0]);

      await waitFor(() => {
        const alreadyWanted = screen.getAllByText('Already Wanted');
        // Original one + newly added
        assert.strictEqual(alreadyWanted.length, 2);
      });
    });

    it('should refresh router after successful add', async () => {
      render(<SearchPage initialQuery="test" initialResults={mockResults} isConfigured={true} />);

      const user = userEvent.setup();
      const wantButtons = screen.getAllByText('+ Want');
      await user.click(wantButtons[0]);

      await waitFor(() => {
        assert.strictEqual(mockRefresh.mock.callCount(), 1);
      });
    });

    it('should handle addToWanted failure gracefully', async () => {
      mockAddToWanted.mock.mockImplementation(async () => {
        throw new Error('Network error');
      });

      render(<SearchPage initialQuery="test" initialResults={mockResults} isConfigured={true} />);

      const user = userEvent.setup();
      const wantButtons = screen.getAllByText('+ Want');
      await user.click(wantButtons[0]);

      // Should not crash, button should return to normal
      await waitFor(() => {
        assert.ok(screen.getAllByText('+ Want').length >= 1);
      });
    });
  });

  describe('Search Form Submission', () => {
    it('should navigate on form submit', async () => {
      render(<SearchPage initialQuery="" initialResults={[]} isConfigured={true} />);

      const user = userEvent.setup();
      const input = screen.getByPlaceholderText('Search by title, author, ISBN...');

      await user.type(input, 'new search');
      await user.click(screen.getByRole('button', { name: 'Search' }));

      await waitFor(() => {
        assert.strictEqual(mockPush.mock.callCount(), 1);
        assert.strictEqual(mockPush.mock.calls[0].arguments[0], '/search?q=new%20search');
      });
    });

    it('should not submit with empty query', async () => {
      render(<SearchPage initialQuery="" initialResults={[]} isConfigured={true} />);

      const button = screen.getByRole('button', { name: 'Search' }) as HTMLButtonElement;
      assert.strictEqual(button.disabled, true);
    });

    it('should trim whitespace from query', async () => {
      render(<SearchPage initialQuery="" initialResults={[]} isConfigured={true} />);

      const user = userEvent.setup();
      const input = screen.getByPlaceholderText('Search by title, author, ISBN...');

      await user.type(input, '  test query  ');
      await user.click(screen.getByRole('button', { name: 'Search' }));

      await waitFor(() => {
        assert.strictEqual(mockPush.mock.calls[0].arguments[0], '/search?q=test%20query');
      });
    });

    it('should encode special characters in query', async () => {
      render(<SearchPage initialQuery="" initialResults={[]} isConfigured={true} />);

      const user = userEvent.setup();
      const input = screen.getByPlaceholderText('Search by title, author, ISBN...');

      await user.type(input, 'test & query');
      await user.click(screen.getByRole('button', { name: 'Search' }));

      await waitFor(() => {
        assert.strictEqual(mockPush.mock.calls[0].arguments[0], '/search?q=test%20%26%20query');
      });
    });
  });
});
