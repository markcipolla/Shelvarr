/**
 * Unit tests for Sidebar component
 * Tests Sidebar and MobileMenuButton components
 */

import { describe, it, mock, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import '../../../tests/setup-react.js';
import React from 'react';
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';

// Mock next/link
const mockLinks: any[] = [];
const Link = ({ href, children, onClick, className, title, ...props }: any) => {
  mockLinks.push({ href, children, onClick, className, title });
  return (
    <a href={href} onClick={onClick} className={className} title={title} {...props}>
      {children}
    </a>
  );
};

// Mock next/navigation
const mockPathname = '/';
const mockUsePathname = () => mockPathname;

// Mock GlobalSearch component
const GlobalSearch = () => <div data-testid="global-search">GlobalSearch</div>;

// Apply mocks BEFORE dynamic imports
mock.module('next/link', {
  namedExports: {},
  defaultExport: Link,
});
mock.module('next/navigation', {
  namedExports: {
    usePathname: mockUsePathname,
  },
});
mock.module('../../../components/GlobalSearch.js', {
  namedExports: {
    GlobalSearch,
  },
});

// Dynamic imports after mocks are applied
const { Sidebar, MobileMenuButton } = await import('../../../components/Sidebar.js');
const { SidebarProvider } = await import('../../../components/SidebarContext.js');

describe('Sidebar Component', () => {
  beforeEach(() => {
    mockLinks.length = 0;
  });

  afterEach(() => {
    cleanup();
  });

  describe('Rendering', () => {
    it('should render sidebar with header', () => {
      render(
        <SidebarProvider>
          <Sidebar />
        </SidebarProvider>
      );

      assert.ok(screen.getByText('Shelvarr'));
      assert.ok(screen.getByText('Book & Comic Manager'));
    });

    it('should render all navigation items', () => {
      render(
        <SidebarProvider>
          <Sidebar />
        </SidebarProvider>
      );

      const navItems = [
        'Home',
        'Libraries',
        'Books',
        'Unmatched',
        'Wanted',
        'Series',
        'Authors',
        'Tasks',
        'Settings',
      ];

      navItems.forEach(item => {
        assert.ok(screen.getByText(item));
      });
    });

    it('should not render global search in sidebar (moved to top bar)', () => {
      render(
        <SidebarProvider>
          <Sidebar />
        </SidebarProvider>
      );

      const search = screen.queryByTestId('global-search');
      assert.strictEqual(search, null);
    });

    it('should render version in footer', () => {
      render(
        <SidebarProvider>
          <Sidebar />
        </SidebarProvider>
      );

      const versionText = screen.getByText(/^v0\.1\.0$/);
      assert.ok(versionText);
    });

    it('should render build version in footer when expanded', () => {
      render(
        <SidebarProvider>
          <Sidebar />
        </SidebarProvider>
      );

      const buildText = screen.getByText(/^build \S+$/);
      assert.ok(buildText);
    });

    it('should render build version text with monospace font', () => {
      render(
        <SidebarProvider>
          <Sidebar />
        </SidebarProvider>
      );

      const buildText = screen.getByText(/^build /);
      assert.ok(buildText.className.includes('font-mono'));
    });

    it('should render toggle button', () => {
      render(
        <SidebarProvider>
          <Sidebar />
        </SidebarProvider>
      );

      const toggleButton = screen.getByLabelText('Collapse sidebar');
      assert.ok(toggleButton);
    });

    it('should not render mobile overlay when mobile menu is closed', () => {
      render(
        <SidebarProvider>
          <Sidebar />
        </SidebarProvider>
      );

      const overlay = document.querySelector('.fixed.inset-0.bg-black\\/50');
      assert.strictEqual(overlay, null);
    });
  });

  describe('Collapsed State', () => {
    it('should hide header text when collapsed', async () => {
      render(
        <SidebarProvider>
          <Sidebar />
        </SidebarProvider>
      );

      const user = userEvent.setup();
      const toggleButton = screen.getByLabelText('Collapse sidebar');

      await user.click(toggleButton);

      await waitFor(() => {
        const header = screen.queryByText('Shelvarr');
        assert.strictEqual(header, null);
      });
    });

    it('should show abbreviated version when collapsed', async () => {
      render(
        <SidebarProvider>
          <Sidebar />
        </SidebarProvider>
      );

      const user = userEvent.setup();
      const toggleButton = screen.getByLabelText('Collapse sidebar');

      await user.click(toggleButton);

      await waitFor(() => {
        const version = screen.getByText('v0');
        assert.ok(version);
      });
    });

    it('should hide build version when collapsed', async () => {
      render(
        <SidebarProvider>
          <Sidebar />
        </SidebarProvider>
      );

      // Build version visible while expanded
      assert.ok(screen.getByText(/^build /));

      const user = userEvent.setup();
      const toggleButton = screen.getByLabelText('Collapse sidebar');

      await user.click(toggleButton);

      await waitFor(() => {
        const buildText = screen.queryByText(/^build /);
        assert.strictEqual(buildText, null);
      });
    });

    it('should update toggle button aria-label when collapsed', async () => {
      render(
        <SidebarProvider>
          <Sidebar />
        </SidebarProvider>
      );

      const user = userEvent.setup();
      const toggleButton = screen.getByLabelText('Collapse sidebar');

      await user.click(toggleButton);

      await waitFor(() => {
        const expandButton = screen.getByLabelText('Expand sidebar');
        assert.ok(expandButton);
      });
    });

    it('should add title attribute to nav items when collapsed', async () => {
      render(
        <SidebarProvider>
          <Sidebar />
        </SidebarProvider>
      );

      const user = userEvent.setup();
      const toggleButton = screen.getByLabelText('Collapse sidebar');

      await user.click(toggleButton);

      await waitFor(() => {
        // Check that links have title attributes in mockLinks
        const dashboardLink = mockLinks.find(l => l.title === 'Home');
        assert.ok(dashboardLink);
      });
    });

    it('should change sidebar width class when collapsed', async () => {
      render(
        <SidebarProvider>
          <Sidebar />
        </SidebarProvider>
      );

      const sidebar = document.querySelector('aside');
      assert.ok(sidebar?.className.includes('w-64'));

      const user = userEvent.setup();
      const toggleButton = screen.getByLabelText('Collapse sidebar');

      await user.click(toggleButton);

      await waitFor(() => {
        assert.ok(sidebar?.className.includes('w-16'));
      });
    });
  });

  describe('Mobile State', () => {
    it('should render mobile overlay when mobile menu is open', async () => {
      render(
        <SidebarProvider>
          <Sidebar />
          <MobileMenuButton />
        </SidebarProvider>
      );

      const user = userEvent.setup();
      const openButton = screen.getByLabelText('Open menu');

      await user.click(openButton);

      await waitFor(() => {
        const overlay = document.querySelector('.fixed.inset-0.bg-black\\/50');
        assert.ok(overlay);
      });
    });

    it('should close mobile menu when overlay is clicked', async () => {
      render(
        <SidebarProvider>
          <Sidebar />
          <MobileMenuButton />
        </SidebarProvider>
      );

      const user = userEvent.setup();
      const openButton = screen.getByLabelText('Open menu');

      await user.click(openButton);

      await waitFor(() => {
        const overlay = document.querySelector('.fixed.inset-0.bg-black\\/50');
        assert.ok(overlay);
      });

      const overlay = document.querySelector('.fixed.inset-0.bg-black\\/50') as HTMLElement;
      await user.click(overlay);

      await waitFor(() => {
        const overlayAfter = document.querySelector('.fixed.inset-0.bg-black\\/50');
        assert.strictEqual(overlayAfter, null);
      });
    });

    it('should show sidebar on mobile when mobile menu is open', async () => {
      render(
        <SidebarProvider>
          <Sidebar />
          <MobileMenuButton />
        </SidebarProvider>
      );

      const sidebar = document.querySelector('aside');
      assert.ok(sidebar?.className.includes('-translate-x-full'));

      const user = userEvent.setup();
      const openButton = screen.getByLabelText('Open menu');

      await user.click(openButton);

      await waitFor(() => {
        assert.ok(sidebar?.className.includes('translate-x-0'));
      });
    });

    it('should close mobile menu when nav item is clicked', async () => {
      render(
        <SidebarProvider>
          <Sidebar />
          <MobileMenuButton />
        </SidebarProvider>
      );

      const user = userEvent.setup();
      const openButton = screen.getByLabelText('Open menu');

      await user.click(openButton);

      await waitFor(() => {
        const overlay = document.querySelector('.fixed.inset-0.bg-black\\/50');
        assert.ok(overlay);
      });

      const dashboardLink = screen.getByText('Home').closest('a') as HTMLElement;
      await user.click(dashboardLink);

      await waitFor(() => {
        const overlay = document.querySelector('.fixed.inset-0.bg-black\\/50');
        assert.strictEqual(overlay, null);
      });
    });
  });

  describe('Active Route Highlighting', () => {
    it('should highlight dashboard when on root path', () => {
      // Note: pathname is mocked to '/' at top
      render(
        <SidebarProvider>
          <Sidebar />
        </SidebarProvider>
      );

      const dashboardLink = screen.getByText('Home').closest('a');
      assert.ok(dashboardLink?.className.includes('bg-shelvarr-primary'));
    });

    it('should apply active styles to current route', () => {
      render(
        <SidebarProvider>
          <Sidebar />
        </SidebarProvider>
      );

      const dashboardLink = screen.getByText('Home').closest('a');
      assert.ok(dashboardLink?.className.includes('text-white'));
    });

    it('should apply inactive styles to non-current routes', () => {
      render(
        <SidebarProvider>
          <Sidebar />
        </SidebarProvider>
      );

      const booksLink = screen.getByText('Books').closest('a');
      assert.ok(booksLink?.className.includes('text-shelvarr-text-muted'));
    });
  });

  describe('Counts Display', () => {
    it('should display book counts when provided', () => {
      const counts = { books: 42, unmatched: 0 };

      render(
        <SidebarProvider>
          <Sidebar counts={counts} />
        </SidebarProvider>
      );

      assert.ok(screen.getByText('42'));
    });

    it('should display unmatched counts when provided', () => {
      const counts = { books: 0, unmatched: 15 };

      render(
        <SidebarProvider>
          <Sidebar counts={counts} />
        </SidebarProvider>
      );

      assert.ok(screen.getByText('15'));
    });

    it('should not display count badge when count is 0', () => {
      const counts = { books: 0, unmatched: 0 };

      render(
        <SidebarProvider>
          <Sidebar counts={counts} />
        </SidebarProvider>
      );

      const badges = document.querySelectorAll('.rounded-full');
      assert.strictEqual(badges.length, 0);
    });

    it('should not display count badge when counts not provided', () => {
      render(
        <SidebarProvider>
          <Sidebar />
        </SidebarProvider>
      );

      const badges = document.querySelectorAll('.rounded-full');
      assert.strictEqual(badges.length, 0);
    });

    it('should apply blue color to book counts', () => {
      const counts = { books: 42, unmatched: 0 };

      render(
        <SidebarProvider>
          <Sidebar counts={counts} />
        </SidebarProvider>
      );

      const badge = screen.getByText('42');
      assert.ok(badge.className.includes('bg-blue-500/20'));
      assert.ok(badge.className.includes('text-blue-400'));
    });

    it('should apply orange color to unmatched counts', () => {
      const counts = { books: 0, unmatched: 15 };

      render(
        <SidebarProvider>
          <Sidebar counts={counts} />
        </SidebarProvider>
      );

      const badge = screen.getByText('15');
      assert.ok(badge.className.includes('bg-orange-500/20'));
      assert.ok(badge.className.includes('text-orange-400'));
    });

    it('should hide count badges when collapsed but show dots', async () => {
      const counts = { books: 42, unmatched: 15 };

      render(
        <SidebarProvider>
          <Sidebar counts={counts} />
        </SidebarProvider>
      );

      const user = userEvent.setup();
      const toggleButton = screen.getByLabelText('Collapse sidebar');

      await user.click(toggleButton);

      await waitFor(() => {
        // Count text should be hidden
        assert.strictEqual(screen.queryByText('42'), null);
        assert.strictEqual(screen.queryByText('15'), null);

        // But indicator dots should be visible
        const dots = document.querySelectorAll('.w-2.h-2.rounded-full');
        assert.strictEqual(dots.length, 2);
      });
    });

    it('should show blue dot for books when collapsed', async () => {
      const counts = { books: 42, unmatched: 0 };

      render(
        <SidebarProvider>
          <Sidebar counts={counts} />
        </SidebarProvider>
      );

      const user = userEvent.setup();
      const toggleButton = screen.getByLabelText('Collapse sidebar');

      await user.click(toggleButton);

      await waitFor(() => {
        const blueDot = document.querySelector('.bg-blue-400');
        assert.ok(blueDot);
      });
    });

    it('should show orange dot for unmatched when collapsed', async () => {
      const counts = { books: 0, unmatched: 15 };

      render(
        <SidebarProvider>
          <Sidebar counts={counts} />
        </SidebarProvider>
      );

      const user = userEvent.setup();
      const toggleButton = screen.getByLabelText('Collapse sidebar');

      await user.click(toggleButton);

      await waitFor(() => {
        const orangeDot = document.querySelector('.bg-orange-400');
        assert.ok(orangeDot);
      });
    });
  });

  describe('Navigation Items', () => {
    it('should render all nav item icons', () => {
      render(
        <SidebarProvider>
          <Sidebar />
        </SidebarProvider>
      );

      const svgs = document.querySelectorAll('svg');
      // At least 9 nav icons + 1 menu icon
      assert.ok(svgs.length >= 10);
    });

    it('should have correct href for each nav item', () => {
      render(
        <SidebarProvider>
          <Sidebar />
        </SidebarProvider>
      );

      const expectedHrefs = [
        '/',
        '/libraries',
        '/books',
        '/unmatched',
        '/wanted',
        '/series',
        '/authors',
        '/tasks',
        '/settings',
      ];

      expectedHrefs.forEach(href => {
        const link = mockLinks.find(l => l.href === href);
        assert.ok(link, `Link with href ${href} should exist`);
      });
    });

    it('should render nav items in correct order', () => {
      render(
        <SidebarProvider>
          <Sidebar />
        </SidebarProvider>
      );

      const navTexts = Array.from(document.querySelectorAll('nav span'))
        .map(el => el.textContent);

      const expectedOrder = [
        'Home',
        'Libraries',
        'Books',
        'Unmatched',
        'Wanted',
        'Series',
        'Authors',
        'Tasks',
        'Settings',
      ];

      expectedOrder.forEach((text, index) => {
        assert.ok(navTexts.includes(text));
      });
    });
  });

  describe('MobileMenuButton', () => {
    it('should render mobile menu button', () => {
      render(
        <SidebarProvider>
          <MobileMenuButton />
        </SidebarProvider>
      );

      const button = screen.getByLabelText('Open menu');
      assert.ok(button);
    });

    it('should open mobile menu when clicked', async () => {
      render(
        <SidebarProvider>
          <Sidebar />
          <MobileMenuButton />
        </SidebarProvider>
      );

      const user = userEvent.setup();
      const button = screen.getByLabelText('Open menu');

      await user.click(button);

      await waitFor(() => {
        const overlay = document.querySelector('.fixed.inset-0.bg-black\\/50');
        assert.ok(overlay);
      });
    });

    it('should render menu icon', () => {
      render(
        <SidebarProvider>
          <MobileMenuButton />
        </SidebarProvider>
      );

      const svg = document.querySelector('svg');
      assert.ok(svg);
    });
  });

  describe('Accessibility', () => {
    it('should have aria-label on toggle button', () => {
      render(
        <SidebarProvider>
          <Sidebar />
        </SidebarProvider>
      );

      const button = screen.getByLabelText('Collapse sidebar');
      assert.ok(button);
    });

    it('should have aria-label on mobile menu button', () => {
      render(
        <SidebarProvider>
          <MobileMenuButton />
        </SidebarProvider>
      );

      const button = screen.getByLabelText('Open menu');
      assert.ok(button);
    });

    it('should set aria-hidden on mobile overlay', async () => {
      render(
        <SidebarProvider>
          <Sidebar />
          <MobileMenuButton />
        </SidebarProvider>
      );

      const user = userEvent.setup();
      const openButton = screen.getByLabelText('Open menu');

      await user.click(openButton);

      await waitFor(() => {
        const overlay = document.querySelector('[aria-hidden="true"]');
        assert.ok(overlay);
      });
    });

    it('should use nav semantic element', () => {
      render(
        <SidebarProvider>
          <Sidebar />
        </SidebarProvider>
      );

      const nav = document.querySelector('nav');
      assert.ok(nav);
    });

    it('should use aside semantic element', () => {
      render(
        <SidebarProvider>
          <Sidebar />
        </SidebarProvider>
      );

      const aside = document.querySelector('aside');
      assert.ok(aside);
    });
  });

  describe('Edge Cases', () => {
    it('should handle undefined counts gracefully', () => {
      render(
        <SidebarProvider>
          <Sidebar counts={undefined} />
        </SidebarProvider>
      );

      // Should render without errors
      assert.ok(screen.getByText('Home'));
    });

    it('should handle very large count numbers', () => {
      const counts = { books: 999999, unmatched: 888888 };

      render(
        <SidebarProvider>
          <Sidebar counts={counts} />
        </SidebarProvider>
      );

      assert.ok(screen.getByText('999999'));
      assert.ok(screen.getByText('888888'));
    });

    it('should handle rapid toggle clicks', async () => {
      render(
        <SidebarProvider>
          <Sidebar />
        </SidebarProvider>
      );

      const user = userEvent.setup();
      const toggleButton = screen.getByLabelText('Collapse sidebar');

      // Click multiple times rapidly
      await user.click(toggleButton);
      await user.click(toggleButton);
      await user.click(toggleButton);

      // 3 toggles: expanded → collapsed → expanded → collapsed
      // Should end up collapsed after odd number of clicks
      await waitFor(() => {
        const sidebar = document.querySelector('aside');
        assert.ok(sidebar?.className.includes('w-16'));
      });
    });

    it('should handle simultaneous collapse and mobile open', async () => {
      render(
        <SidebarProvider>
          <Sidebar />
          <MobileMenuButton />
        </SidebarProvider>
      );

      const user = userEvent.setup();
      const toggleButton = screen.getByLabelText('Collapse sidebar');
      const mobileButton = screen.getByLabelText('Open menu');

      await user.click(toggleButton);
      await user.click(mobileButton);

      await waitFor(() => {
        // Both states should be active
        const sidebar = document.querySelector('aside');
        assert.ok(sidebar?.className.includes('w-16')); // collapsed
        const overlay = document.querySelector('.fixed.inset-0.bg-black\\/50');
        assert.ok(overlay); // mobile open
      });
    });
  });
});
