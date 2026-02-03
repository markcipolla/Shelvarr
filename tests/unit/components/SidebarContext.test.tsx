/**
 * Unit tests for SidebarContext
 * Tests SidebarProvider and useSidebar hook
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import '../../../tests/setup-react.js';
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { SidebarProvider, useSidebar } from '../../../components/SidebarContext.js';

describe('SidebarContext', () => {
  let listeners: { [key: string]: EventListener[] } = {};

  beforeEach(() => {
    // Mock event listeners
    listeners = {};
    const originalAddEventListener = document.addEventListener;
    const originalRemoveEventListener = document.removeEventListener;

    document.addEventListener = function(type: string, listener: EventListener) {
      if (!listeners[type]) {
        listeners[type] = [];
      }
      listeners[type].push(listener);
      return originalAddEventListener.call(this, type, listener);
    } as any;

    document.removeEventListener = function(type: string, listener: EventListener) {
      if (listeners[type]) {
        listeners[type] = listeners[type].filter(l => l !== listener);
      }
      return originalRemoveEventListener.call(this, type, listener);
    } as any;
  });

  afterEach(() => {
    // Clean up listeners
    Object.keys(listeners).forEach(type => {
      listeners[type].forEach(listener => {
        document.removeEventListener(type, listener);
      });
    });
  });

  describe('SidebarProvider', () => {
    it('should render children', () => {
      const { container } = render(
        <SidebarProvider>
          <div data-testid="child">Test Child</div>
        </SidebarProvider>
      );

      assert.ok(screen.getByTestId('child'));
      assert.strictEqual(screen.getByTestId('child').textContent, 'Test Child');
    });

    it('should provide sidebar context to children', () => {
      let capturedContext: any = null;

      function TestComponent() {
        capturedContext = useSidebar();
        return <div>Test</div>;
      }

      render(
        <SidebarProvider>
          <TestComponent />
        </SidebarProvider>
      );

      assert.ok(capturedContext);
      assert.strictEqual(typeof capturedContext.isCollapsed, 'boolean');
      assert.strictEqual(typeof capturedContext.isMobileOpen, 'boolean');
      assert.strictEqual(typeof capturedContext.toggleCollapsed, 'function');
      assert.strictEqual(typeof capturedContext.openMobile, 'function');
      assert.strictEqual(typeof capturedContext.closeMobile, 'function');
    });

    it('should initialize with collapsed=false and mobileOpen=false', () => {
      let capturedContext: any = null;

      function TestComponent() {
        capturedContext = useSidebar();
        return <div>Test</div>;
      }

      render(
        <SidebarProvider>
          <TestComponent />
        </SidebarProvider>
      );

      assert.strictEqual(capturedContext.isCollapsed, false);
      assert.strictEqual(capturedContext.isMobileOpen, false);
    });

    it('should add escape key listener on mount', () => {
      render(
        <SidebarProvider>
          <div>Test</div>
        </SidebarProvider>
      );

      assert.ok(listeners.keydown);
      assert.strictEqual(listeners.keydown.length, 1);
    });

    it('should remove escape key listener on unmount', () => {
      const { unmount } = render(
        <SidebarProvider>
          <div>Test</div>
        </SidebarProvider>
      );

      const listenerCount = listeners.keydown?.length || 0;
      assert.ok(listenerCount > 0);

      unmount();

      // Listener should be removed
      assert.strictEqual(listeners.keydown.length, 0);
    });
  });

  describe('useSidebar hook', () => {
    it('should throw error when used outside SidebarProvider', () => {
      function TestComponent() {
        useSidebar();
        return <div>Test</div>;
      }

      assert.throws(
        () => {
          render(<TestComponent />);
        },
        {
          message: 'useSidebar must be used within a SidebarProvider',
        }
      );
    });

    it('should provide isCollapsed state', () => {
      function TestComponent() {
        const { isCollapsed } = useSidebar();
        return <div data-testid="state">{String(isCollapsed)}</div>;
      }

      render(
        <SidebarProvider>
          <TestComponent />
        </SidebarProvider>
      );

      assert.strictEqual(screen.getByTestId('state').textContent, 'false');
    });

    it('should provide isMobileOpen state', () => {
      function TestComponent() {
        const { isMobileOpen } = useSidebar();
        return <div data-testid="state">{String(isMobileOpen)}</div>;
      }

      render(
        <SidebarProvider>
          <TestComponent />
        </SidebarProvider>
      );

      assert.strictEqual(screen.getByTestId('state').textContent, 'false');
    });
  });

  describe('toggleCollapsed', () => {
    it('should toggle isCollapsed from false to true', async () => {
      function TestComponent() {
        const { isCollapsed, toggleCollapsed } = useSidebar();
        return (
          <>
            <div data-testid="state">{String(isCollapsed)}</div>
            <button onClick={toggleCollapsed}>Toggle</button>
          </>
        );
      }

      render(
        <SidebarProvider>
          <TestComponent />
        </SidebarProvider>
      );

      assert.strictEqual(screen.getByTestId('state').textContent, 'false');

      const user = userEvent.setup();
      await user.click(screen.getByRole('button'));

      await waitFor(() => {
        assert.strictEqual(screen.getByTestId('state').textContent, 'true');
      });
    });

    it('should toggle isCollapsed from true to false', async () => {
      function TestComponent() {
        const { isCollapsed, toggleCollapsed } = useSidebar();
        return (
          <>
            <div data-testid="state">{String(isCollapsed)}</div>
            <button onClick={toggleCollapsed}>Toggle</button>
          </>
        );
      }

      render(
        <SidebarProvider>
          <TestComponent />
        </SidebarProvider>
      );

      const user = userEvent.setup();

      // Toggle twice to get back to false
      await user.click(screen.getByRole('button'));
      await waitFor(() => {
        assert.strictEqual(screen.getByTestId('state').textContent, 'true');
      });

      await user.click(screen.getByRole('button'));
      await waitFor(() => {
        assert.strictEqual(screen.getByTestId('state').textContent, 'false');
      });
    });

    it('should work with multiple rapid toggles', async () => {
      function TestComponent() {
        const { isCollapsed, toggleCollapsed } = useSidebar();
        return (
          <>
            <div data-testid="state">{String(isCollapsed)}</div>
            <button onClick={toggleCollapsed}>Toggle</button>
          </>
        );
      }

      render(
        <SidebarProvider>
          <TestComponent />
        </SidebarProvider>
      );

      const user = userEvent.setup();

      // Toggle multiple times rapidly
      await user.click(screen.getByRole('button'));
      await user.click(screen.getByRole('button'));
      await user.click(screen.getByRole('button'));

      await waitFor(() => {
        assert.strictEqual(screen.getByTestId('state').textContent, 'true');
      });
    });
  });

  describe('openMobile', () => {
    it('should set isMobileOpen to true', async () => {
      function TestComponent() {
        const { isMobileOpen, openMobile } = useSidebar();
        return (
          <>
            <div data-testid="state">{String(isMobileOpen)}</div>
            <button onClick={openMobile}>Open</button>
          </>
        );
      }

      render(
        <SidebarProvider>
          <TestComponent />
        </SidebarProvider>
      );

      assert.strictEqual(screen.getByTestId('state').textContent, 'false');

      const user = userEvent.setup();
      await user.click(screen.getByRole('button'));

      await waitFor(() => {
        assert.strictEqual(screen.getByTestId('state').textContent, 'true');
      });
    });

    it('should have no effect if already open', async () => {
      function TestComponent() {
        const { isMobileOpen, openMobile } = useSidebar();
        return (
          <>
            <div data-testid="state">{String(isMobileOpen)}</div>
            <button onClick={openMobile}>Open</button>
          </>
        );
      }

      render(
        <SidebarProvider>
          <TestComponent />
        </SidebarProvider>
      );

      const user = userEvent.setup();

      // Open twice
      await user.click(screen.getByRole('button'));
      await waitFor(() => {
        assert.strictEqual(screen.getByTestId('state').textContent, 'true');
      });

      await user.click(screen.getByRole('button'));
      await waitFor(() => {
        assert.strictEqual(screen.getByTestId('state').textContent, 'true');
      });
    });

    it('should not affect isCollapsed state', async () => {
      function TestComponent() {
        const { isCollapsed, isMobileOpen, openMobile } = useSidebar();
        return (
          <>
            <div data-testid="collapsed">{String(isCollapsed)}</div>
            <div data-testid="mobile">{String(isMobileOpen)}</div>
            <button onClick={openMobile}>Open</button>
          </>
        );
      }

      render(
        <SidebarProvider>
          <TestComponent />
        </SidebarProvider>
      );

      const user = userEvent.setup();
      await user.click(screen.getByRole('button'));

      await waitFor(() => {
        assert.strictEqual(screen.getByTestId('collapsed').textContent, 'false');
        assert.strictEqual(screen.getByTestId('mobile').textContent, 'true');
      });
    });
  });

  describe('closeMobile', () => {
    it('should set isMobileOpen to false', async () => {
      function TestComponent() {
        const { isMobileOpen, openMobile, closeMobile } = useSidebar();
        return (
          <>
            <div data-testid="state">{String(isMobileOpen)}</div>
            <button data-testid="open" onClick={openMobile}>Open</button>
            <button data-testid="close" onClick={closeMobile}>Close</button>
          </>
        );
      }

      render(
        <SidebarProvider>
          <TestComponent />
        </SidebarProvider>
      );

      const user = userEvent.setup();

      // Open first
      await user.click(screen.getByTestId('open'));
      await waitFor(() => {
        assert.strictEqual(screen.getByTestId('state').textContent, 'true');
      });

      // Then close
      await user.click(screen.getByTestId('close'));
      await waitFor(() => {
        assert.strictEqual(screen.getByTestId('state').textContent, 'false');
      });
    });

    it('should have no effect if already closed', async () => {
      function TestComponent() {
        const { isMobileOpen, closeMobile } = useSidebar();
        return (
          <>
            <div data-testid="state">{String(isMobileOpen)}</div>
            <button onClick={closeMobile}>Close</button>
          </>
        );
      }

      render(
        <SidebarProvider>
          <TestComponent />
        </SidebarProvider>
      );

      const user = userEvent.setup();

      // Close when already closed
      await user.click(screen.getByRole('button'));
      await waitFor(() => {
        assert.strictEqual(screen.getByTestId('state').textContent, 'false');
      });
    });

    it('should not affect isCollapsed state', async () => {
      function TestComponent() {
        const { isCollapsed, isMobileOpen, openMobile, closeMobile } = useSidebar();
        return (
          <>
            <div data-testid="collapsed">{String(isCollapsed)}</div>
            <div data-testid="mobile">{String(isMobileOpen)}</div>
            <button data-testid="open" onClick={openMobile}>Open</button>
            <button data-testid="close" onClick={closeMobile}>Close</button>
          </>
        );
      }

      render(
        <SidebarProvider>
          <TestComponent />
        </SidebarProvider>
      );

      const user = userEvent.setup();

      await user.click(screen.getByTestId('open'));
      await user.click(screen.getByTestId('close'));

      await waitFor(() => {
        assert.strictEqual(screen.getByTestId('collapsed').textContent, 'false');
        assert.strictEqual(screen.getByTestId('mobile').textContent, 'false');
      });
    });
  });

  describe('Escape key handling', () => {
    it('should close mobile menu when Escape key is pressed', async () => {
      function TestComponent() {
        const { isMobileOpen, openMobile } = useSidebar();
        return (
          <>
            <div data-testid="state">{String(isMobileOpen)}</div>
            <button onClick={openMobile}>Open</button>
          </>
        );
      }

      render(
        <SidebarProvider>
          <TestComponent />
        </SidebarProvider>
      );

      const user = userEvent.setup();

      // Open mobile menu
      await user.click(screen.getByRole('button'));
      await waitFor(() => {
        assert.strictEqual(screen.getByTestId('state').textContent, 'true');
      });

      // Press Escape key
      const escapeEvent = new KeyboardEvent('keydown', { key: 'Escape' });
      document.dispatchEvent(escapeEvent);

      await waitFor(() => {
        assert.strictEqual(screen.getByTestId('state').textContent, 'false');
      });
    });

    it('should do nothing when Escape pressed and menu already closed', () => {
      function TestComponent() {
        const { isMobileOpen } = useSidebar();
        return <div data-testid="state">{String(isMobileOpen)}</div>;
      }

      render(
        <SidebarProvider>
          <TestComponent />
        </SidebarProvider>
      );

      assert.strictEqual(screen.getByTestId('state').textContent, 'false');

      const escapeEvent = new KeyboardEvent('keydown', { key: 'Escape' });
      document.dispatchEvent(escapeEvent);

      // Should still be false
      assert.strictEqual(screen.getByTestId('state').textContent, 'false');
    });

    it('should not affect collapsed state when Escape is pressed', async () => {
      function TestComponent() {
        const { isCollapsed, isMobileOpen, toggleCollapsed, openMobile } = useSidebar();
        return (
          <>
            <div data-testid="collapsed">{String(isCollapsed)}</div>
            <div data-testid="mobile">{String(isMobileOpen)}</div>
            <button data-testid="toggle" onClick={toggleCollapsed}>Toggle</button>
            <button data-testid="open" onClick={openMobile}>Open</button>
          </>
        );
      }

      render(
        <SidebarProvider>
          <TestComponent />
        </SidebarProvider>
      );

      const user = userEvent.setup();

      // Set both states
      await user.click(screen.getByTestId('toggle'));
      await user.click(screen.getByTestId('open'));

      await waitFor(() => {
        assert.strictEqual(screen.getByTestId('collapsed').textContent, 'true');
        assert.strictEqual(screen.getByTestId('mobile').textContent, 'true');
      });

      // Press Escape
      const escapeEvent = new KeyboardEvent('keydown', { key: 'Escape' });
      document.dispatchEvent(escapeEvent);

      await waitFor(() => {
        assert.strictEqual(screen.getByTestId('collapsed').textContent, 'true');
        assert.strictEqual(screen.getByTestId('mobile').textContent, 'false');
      });
    });

    it('should ignore non-Escape key presses', async () => {
      function TestComponent() {
        const { isMobileOpen, openMobile } = useSidebar();
        return (
          <>
            <div data-testid="state">{String(isMobileOpen)}</div>
            <button onClick={openMobile}>Open</button>
          </>
        );
      }

      render(
        <SidebarProvider>
          <TestComponent />
        </SidebarProvider>
      );

      const user = userEvent.setup();

      await user.click(screen.getByRole('button'));
      await waitFor(() => {
        assert.strictEqual(screen.getByTestId('state').textContent, 'true');
      });

      // Press other keys
      const enterEvent = new KeyboardEvent('keydown', { key: 'Enter' });
      const spaceEvent = new KeyboardEvent('keydown', { key: ' ' });

      document.dispatchEvent(enterEvent);
      document.dispatchEvent(spaceEvent);

      // Should still be open
      assert.strictEqual(screen.getByTestId('state').textContent, 'true');
    });
  });

  describe('Integration scenarios', () => {
    it('should handle all state changes independently', async () => {
      function TestComponent() {
        const { isCollapsed, isMobileOpen, toggleCollapsed, openMobile, closeMobile } = useSidebar();
        return (
          <>
            <div data-testid="collapsed">{String(isCollapsed)}</div>
            <div data-testid="mobile">{String(isMobileOpen)}</div>
            <button data-testid="toggle" onClick={toggleCollapsed}>Toggle</button>
            <button data-testid="open" onClick={openMobile}>Open</button>
            <button data-testid="close" onClick={closeMobile}>Close</button>
          </>
        );
      }

      render(
        <SidebarProvider>
          <TestComponent />
        </SidebarProvider>
      );

      const user = userEvent.setup();

      // Initial state
      assert.strictEqual(screen.getByTestId('collapsed').textContent, 'false');
      assert.strictEqual(screen.getByTestId('mobile').textContent, 'false');

      // Toggle collapsed
      await user.click(screen.getByTestId('toggle'));
      await waitFor(() => {
        assert.strictEqual(screen.getByTestId('collapsed').textContent, 'true');
        assert.strictEqual(screen.getByTestId('mobile').textContent, 'false');
      });

      // Open mobile
      await user.click(screen.getByTestId('open'));
      await waitFor(() => {
        assert.strictEqual(screen.getByTestId('collapsed').textContent, 'true');
        assert.strictEqual(screen.getByTestId('mobile').textContent, 'true');
      });

      // Toggle collapsed again
      await user.click(screen.getByTestId('toggle'));
      await waitFor(() => {
        assert.strictEqual(screen.getByTestId('collapsed').textContent, 'false');
        assert.strictEqual(screen.getByTestId('mobile').textContent, 'true');
      });

      // Close mobile
      await user.click(screen.getByTestId('close'));
      await waitFor(() => {
        assert.strictEqual(screen.getByTestId('collapsed').textContent, 'false');
        assert.strictEqual(screen.getByTestId('mobile').textContent, 'false');
      });
    });

    it('should work with multiple consuming components', async () => {
      function Component1() {
        const { isCollapsed, toggleCollapsed } = useSidebar();
        return (
          <>
            <div data-testid="comp1-state">{String(isCollapsed)}</div>
            <button data-testid="comp1-toggle" onClick={toggleCollapsed}>
              Toggle1
            </button>
          </>
        );
      }

      function Component2() {
        const { isCollapsed } = useSidebar();
        return <div data-testid="comp2-state">{String(isCollapsed)}</div>;
      }

      render(
        <SidebarProvider>
          <Component1 />
          <Component2 />
        </SidebarProvider>
      );

      const user = userEvent.setup();

      // Both should show same state
      assert.strictEqual(screen.getByTestId('comp1-state').textContent, 'false');
      assert.strictEqual(screen.getByTestId('comp2-state').textContent, 'false');

      // Toggle from component 1
      await user.click(screen.getByTestId('comp1-toggle'));

      await waitFor(() => {
        assert.strictEqual(screen.getByTestId('comp1-state').textContent, 'true');
        assert.strictEqual(screen.getByTestId('comp2-state').textContent, 'true');
      });
    });
  });
});
