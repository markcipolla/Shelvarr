/**
 * Unit tests for Toast component
 * Tests ToastProvider, useToast hook, ToastContainer, and ToastItem
 */

import { describe, it, beforeEach, mock } from 'node:test';
import assert from 'node:assert';
import '../../../tests/setup-react.js';
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { ToastProvider, useToast } from '../../../components/ui/Toast.js';

describe('Toast Component', () => {
  beforeEach(() => {
    // Setup fake timers for each test
    mock.timers.enable({ apis: ['setTimeout'] });
  });

  describe('ToastProvider', () => {
    it('should render children', () => {
      const { container } = render(
        <ToastProvider>
          <div data-testid="child">Test Child</div>
        </ToastProvider>
      );

      assert.ok(screen.getByTestId('child'));
      assert.strictEqual(screen.getByTestId('child').textContent, 'Test Child');
    });

    it('should provide toast context to children', () => {
      let capturedContext: any = null;

      function TestComponent() {
        capturedContext = useToast();
        return <div>Test</div>;
      }

      render(
        <ToastProvider>
          <TestComponent />
        </ToastProvider>
      );

      assert.ok(capturedContext);
      assert.ok(typeof capturedContext.toast === 'function');
      assert.ok(typeof capturedContext.success === 'function');
      assert.ok(typeof capturedContext.error === 'function');
      assert.ok(typeof capturedContext.info === 'function');
    });
  });

  describe('useToast hook', () => {
    it('should throw error when used outside ToastProvider', () => {
      function TestComponent() {
        useToast();
        return <div>Test</div>;
      }

      assert.throws(
        () => {
          render(<TestComponent />);
        },
        {
          message: 'useToast must be used within a ToastProvider',
        }
      );
    });

    it('should provide toast function that adds toast', async () => {
      function TestComponent() {
        const { toast } = useToast();
        return (
          <button onClick={() => toast('Test message', 'info')}>
            Show Toast
          </button>
        );
      }

      render(
        <ToastProvider>
          <TestComponent />
        </ToastProvider>
      );

      const user = userEvent.setup();
      await user.click(screen.getByRole('button'));

      await waitFor(() => {
        assert.ok(screen.getByText('Test message'));
      });
    });

    it('should provide success shorthand method', async () => {
      function TestComponent() {
        const { success } = useToast();
        return (
          <button onClick={() => success('Success message')}>
            Show Success
          </button>
        );
      }

      render(
        <ToastProvider>
          <TestComponent />
        </ToastProvider>
      );

      const user = userEvent.setup();
      await user.click(screen.getByRole('button'));

      await waitFor(() => {
        const toast = screen.getByText('Success message').closest('div');
        assert.ok(toast?.className.includes('bg-green-600'));
      });
    });

    it('should provide error shorthand method', async () => {
      function TestComponent() {
        const { error } = useToast();
        return (
          <button onClick={() => error('Error message')}>
            Show Error
          </button>
        );
      }

      render(
        <ToastProvider>
          <TestComponent />
        </ToastProvider>
      );

      const user = userEvent.setup();
      await user.click(screen.getByRole('button'));

      await waitFor(() => {
        const toast = screen.getByText('Error message').closest('div');
        assert.ok(toast?.className.includes('bg-red-600'));
      });
    });

    it('should provide info shorthand method', async () => {
      function TestComponent() {
        const { info } = useToast();
        return (
          <button onClick={() => info('Info message')}>
            Show Info
          </button>
        );
      }

      render(
        <ToastProvider>
          <TestComponent />
        </ToastProvider>
      );

      const user = userEvent.setup();
      await user.click(screen.getByRole('button'));

      await waitFor(() => {
        const toast = screen.getByText('Info message').closest('div');
        assert.ok(toast?.className.includes('bg-blue-600'));
      });
    });
  });

  describe('ToastContainer', () => {
    it('should not render when no toasts exist', () => {
      render(<ToastProvider><div>Content</div></ToastProvider>);

      const toastContainer = document.querySelector('.fixed.bottom-4.right-4');
      assert.strictEqual(toastContainer, null);
    });

    it('should render toast container when toasts are added', async () => {
      function TestComponent() {
        const { toast } = useToast();
        return (
          <button onClick={() => toast('Test', 'info')}>
            Add Toast
          </button>
        );
      }

      render(
        <ToastProvider>
          <TestComponent />
        </ToastProvider>
      );

      const user = userEvent.setup();
      await user.click(screen.getByRole('button'));

      await waitFor(() => {
        const container = document.querySelector('.fixed.bottom-4.right-4');
        assert.ok(container);
      });
    });

    it('should render multiple toasts', async () => {
      function TestComponent() {
        const { toast } = useToast();
        return (
          <>
            <button onClick={() => toast('First', 'info')}>Toast 1</button>
            <button onClick={() => toast('Second', 'success')}>Toast 2</button>
            <button onClick={() => toast('Third', 'error')}>Toast 3</button>
          </>
        );
      }

      render(
        <ToastProvider>
          <TestComponent />
        </ToastProvider>
      );

      const user = userEvent.setup();
      await user.click(screen.getByText('Toast 1'));
      await user.click(screen.getByText('Toast 2'));
      await user.click(screen.getByText('Toast 3'));

      await waitFor(() => {
        assert.ok(screen.getByText('First'));
        assert.ok(screen.getByText('Second'));
        assert.ok(screen.getByText('Third'));
      });
    });

    it('should auto-remove toasts after 4 seconds', async () => {
      function TestComponent() {
        const { toast } = useToast();
        return (
          <button onClick={() => toast('Auto remove', 'info')}>
            Add Toast
          </button>
        );
      }

      render(
        <ToastProvider>
          <TestComponent />
        </ToastProvider>
      );

      const user = userEvent.setup();
      await user.click(screen.getByRole('button'));

      await waitFor(() => {
        assert.ok(screen.getByText('Auto remove'));
      });

      // Advance time by 4 seconds
      mock.timers.tick(4000);

      await waitFor(() => {
        assert.strictEqual(screen.queryByText('Auto remove'), null);
      });
    });
  });

  describe('ToastItem', () => {
    it('should render success toast with correct styling', async () => {
      function TestComponent() {
        const { success } = useToast();
        return (
          <button onClick={() => success('Success!')}>
            Success
          </button>
        );
      }

      render(
        <ToastProvider>
          <TestComponent />
        </ToastProvider>
      );

      const user = userEvent.setup();
      await user.click(screen.getByRole('button'));

      await waitFor(() => {
        const toast = screen.getByText('Success!').closest('div');
        assert.ok(toast?.className.includes('bg-green-600'));
        assert.ok(toast?.className.includes('text-white'));
      });
    });

    it('should render error toast with correct styling', async () => {
      function TestComponent() {
        const { error } = useToast();
        return (
          <button onClick={() => error('Error!')}>
            Error
          </button>
        );
      }

      render(
        <ToastProvider>
          <TestComponent />
        </ToastProvider>
      );

      const user = userEvent.setup();
      await user.click(screen.getByRole('button'));

      await waitFor(() => {
        const toast = screen.getByText('Error!').closest('div');
        assert.ok(toast?.className.includes('bg-red-600'));
        assert.ok(toast?.className.includes('text-white'));
      });
    });

    it('should render info toast with correct styling', async () => {
      function TestComponent() {
        const { info } = useToast();
        return (
          <button onClick={() => info('Info!')}>
            Info
          </button>
        );
      }

      render(
        <ToastProvider>
          <TestComponent />
        </ToastProvider>
      );

      const user = userEvent.setup();
      await user.click(screen.getByRole('button'));

      await waitFor(() => {
        const toast = screen.getByText('Info!').closest('div');
        assert.ok(toast?.className.includes('bg-blue-600'));
        assert.ok(toast?.className.includes('text-white'));
      });
    });

    it('should render close button', async () => {
      function TestComponent() {
        const { toast } = useToast();
        return (
          <button onClick={() => toast('Closeable', 'info')}>
            Add Toast
          </button>
        );
      }

      render(
        <ToastProvider>
          <TestComponent />
        </ToastProvider>
      );

      const user = userEvent.setup();
      await user.click(screen.getByRole('button'));

      await waitFor(() => {
        const closeButtons = document.querySelectorAll('button');
        // Should have original button + close button
        assert.ok(closeButtons.length > 1);
      });
    });

    it('should remove toast when close button clicked', async () => {
      function TestComponent() {
        const { toast } = useToast();
        return (
          <button data-testid="add-toast" onClick={() => toast('Closeable', 'info')}>
            Add Toast
          </button>
        );
      }

      render(
        <ToastProvider>
          <TestComponent />
        </ToastProvider>
      );

      const user = userEvent.setup();
      await user.click(screen.getByTestId('add-toast'));

      await waitFor(() => {
        assert.ok(screen.getByText('Closeable'));
      });

      // Find and click the close button (last button that's not the add-toast button)
      const buttons = document.querySelectorAll('button');
      const closeButton = Array.from(buttons).find(btn =>
        btn !== screen.getByTestId('add-toast')
      );

      assert.ok(closeButton);
      await user.click(closeButton);

      await waitFor(() => {
        assert.strictEqual(screen.queryByText('Closeable'), null);
      });
    });

    it('should render appropriate icon for each toast type', async () => {
      function TestComponent() {
        const { success, error, info } = useToast();
        return (
          <>
            <button onClick={() => success('Success')}>Success</button>
            <button onClick={() => error('Error')}>Error</button>
            <button onClick={() => info('Info')}>Info</button>
          </>
        );
      }

      render(
        <ToastProvider>
          <TestComponent />
        </ToastProvider>
      );

      const user = userEvent.setup();

      await user.click(screen.getByText('Success'));
      await user.click(screen.getByText('Error'));
      await user.click(screen.getByText('Info'));

      await waitFor(() => {
        // Each toast should have an SVG icon
        const svgs = document.querySelectorAll('svg');
        assert.ok(svgs.length >= 3); // At least 3 icons (one per toast type)
      });
    });

    it('should display toast message correctly', async () => {
      function TestComponent() {
        const { toast } = useToast();
        return (
          <button onClick={() => toast('This is a test message', 'info')}>
            Show
          </button>
        );
      }

      render(
        <ToastProvider>
          <TestComponent />
        </ToastProvider>
      );

      const user = userEvent.setup();
      await user.click(screen.getByRole('button'));

      await waitFor(() => {
        const message = screen.getByText('This is a test message');
        assert.ok(message);
        assert.ok(message.className.includes('text-sm'));
      });
    });

    it('should handle multiple rapid toast additions', async () => {
      function TestComponent() {
        const { toast } = useToast();
        const addMultiple = () => {
          toast('Toast 1', 'info');
          toast('Toast 2', 'success');
          toast('Toast 3', 'error');
          toast('Toast 4', 'info');
          toast('Toast 5', 'success');
        };
        return (
          <button onClick={addMultiple}>
            Add Multiple
          </button>
        );
      }

      render(
        <ToastProvider>
          <TestComponent />
        </ToastProvider>
      );

      const user = userEvent.setup();
      await user.click(screen.getByRole('button'));

      await waitFor(() => {
        assert.ok(screen.getByText('Toast 1'));
        assert.ok(screen.getByText('Toast 2'));
        assert.ok(screen.getByText('Toast 3'));
        assert.ok(screen.getByText('Toast 4'));
        assert.ok(screen.getByText('Toast 5'));
      });
    });

    it('should maintain unique IDs for each toast', async () => {
      function TestComponent() {
        const { toast } = useToast();
        return (
          <>
            <button onClick={() => toast('Message', 'info')}>
              Add
            </button>
          </>
        );
      }

      render(
        <ToastProvider>
          <TestComponent />
        </ToastProvider>
      );

      const user = userEvent.setup();

      // Add same message multiple times
      await user.click(screen.getByRole('button'));
      await user.click(screen.getByRole('button'));
      await user.click(screen.getByRole('button'));

      await waitFor(() => {
        const messages = screen.getAllByText('Message');
        assert.strictEqual(messages.length, 3);
      });
    });

    it('should apply animation classes', async () => {
      function TestComponent() {
        const { toast } = useToast();
        return (
          <button onClick={() => toast('Animated', 'info')}>
            Add
          </button>
        );
      }

      render(
        <ToastProvider>
          <TestComponent />
        </ToastProvider>
      );

      const user = userEvent.setup();
      await user.click(screen.getByRole('button'));

      await waitFor(() => {
        const toast = screen.getByText('Animated').closest('div');
        assert.ok(toast?.className.includes('animate-slide-in'));
      });
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty message gracefully', async () => {
      function TestComponent() {
        const { toast } = useToast();
        return (
          <button onClick={() => toast('', 'info')}>
            Empty
          </button>
        );
      }

      render(
        <ToastProvider>
          <TestComponent />
        </ToastProvider>
      );

      const user = userEvent.setup();
      await user.click(screen.getByRole('button'));

      // Should still render the toast container
      await waitFor(() => {
        const container = document.querySelector('.fixed.bottom-4.right-4');
        assert.ok(container);
      });
    });

    it('should handle very long messages', async () => {
      const longMessage = 'A'.repeat(500);

      function TestComponent() {
        const { toast } = useToast();
        return (
          <button onClick={() => toast(longMessage, 'info')}>
            Long
          </button>
        );
      }

      render(
        <ToastProvider>
          <TestComponent />
        </ToastProvider>
      );

      const user = userEvent.setup();
      await user.click(screen.getByRole('button'));

      await waitFor(() => {
        assert.ok(screen.getByText(longMessage));
      });
    });

    it('should default to info type when no type specified', async () => {
      function TestComponent() {
        const { toast } = useToast();
        return (
          <button onClick={() => toast('Default type')}>
            Add
          </button>
        );
      }

      render(
        <ToastProvider>
          <TestComponent />
        </ToastProvider>
      );

      const user = userEvent.setup();
      await user.click(screen.getByRole('button'));

      await waitFor(() => {
        const toast = screen.getByText('Default type').closest('div');
        assert.ok(toast?.className.includes('bg-blue-600')); // info is blue
      });
    });
  });
});
