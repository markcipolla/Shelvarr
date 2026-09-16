/**
 * Unit tests for PdfReader.
 *
 * There's deliberately little to cover here: the whole point of this
 * component is that it does nothing clever — it points an iframe at the
 * book's file route and lets the browser's native PDF viewer take over, with
 * no page-progress tracking of its own (see the component's doc comment for
 * why). These tests just confirm it renders that iframe at the right URL,
 * shows the book's title/authors in the header, and calls onClose from both
 * the close button and Escape.
 */

import { describe, it, mock, afterEach } from 'node:test';
import assert from 'node:assert';
import '../../../tests/setup-react.js';
import { render, screen, cleanup, act } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';

const { PdfReader } = await import('../../../components/books/PdfReader.js');

const book = {
  id: 12,
  title: 'The Mistborn Codex',
  authors: JSON.stringify(['Brandon Sanderson']),
  filePath: '/books/mistborn-codex.pdf',
  metadataSource: null,
} as any;

describe('PdfReader Component', () => {
  afterEach(() => {
    cleanup();
  });

  it('renders an iframe pointed at the book file route', () => {
    render(<PdfReader book={book} onClose={() => {}} />);

    const iframe = document.querySelector('iframe');
    assert.ok(iframe, 'expected an iframe');
    assert.strictEqual(iframe!.getAttribute('src'), '/api/books/12/file');
  });

  it('shows the title and authors in the header', () => {
    render(<PdfReader book={book} onClose={() => {}} />);

    assert.ok(screen.getByText('The Mistborn Codex'));
    assert.ok(screen.getByText('Brandon Sanderson'));
  });

  it('calls onClose when the close button is clicked', async () => {
    const onClose = mock.fn();
    const user = userEvent.setup();
    render(<PdfReader book={book} onClose={onClose} />);

    await user.click(screen.getByLabelText('Close reader'));
    assert.strictEqual(onClose.mock.callCount(), 1);
  });

  it('calls onClose on Escape', () => {
    const onClose = mock.fn();
    render(<PdfReader book={book} onClose={onClose} />);

    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    });
    assert.strictEqual(onClose.mock.callCount(), 1);
  });
});
