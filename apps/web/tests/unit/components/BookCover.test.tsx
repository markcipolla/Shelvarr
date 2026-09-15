/**
 * Unit tests for BookCover
 *
 * The cover is mostly CSS, but three behaviours live in the component: a cover
 * that fails to load gives way to a typographic one, comics have no spine, and
 * overlay controls sit outside the part that turns.
 */

import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert';
import '../../../tests/setup-react.js';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';

const { BookCover } = await import('../../../components/ui/BookCover.js');

describe('BookCover Component', () => {
  afterEach(() => {
    cleanup();
  });

  it('shows the cover image, named for the book', () => {
    render(<BookCover src="https://example.com/dune.jpg" title="Dune" author="Frank Herbert" />);

    const cover = screen.getByRole('img', { name: 'Dune' }) as HTMLImageElement;
    assert.strictEqual(cover.src, 'https://example.com/dune.jpg');
  });

  it('draws a typographic cover when there is no image', () => {
    const { container } = render(<BookCover title="Dune" author="Frank Herbert" />);

    const plain = screen.getByRole('img', { name: 'Dune' });
    assert.strictEqual(plain.tagName, 'DIV');
    assert.strictEqual(plain.getAttribute('data-author'), 'Frank Herbert');
    assert.strictEqual(container.querySelectorAll('img').length, 0);
  });

  it('falls back to the typographic cover when the image fails', () => {
    const { container } = render(<BookCover src="https://example.com/missing.jpg" title="Dune" />);

    fireEvent.error(screen.getByRole('img', { name: 'Dune' }));

    assert.strictEqual(screen.getByRole('img', { name: 'Dune' }).tagName, 'DIV');
    assert.strictEqual(container.querySelectorAll('img').length, 0);
  });

  it('gives books a spine and comics pages instead', () => {
    const { container, rerender } = render(<BookCover src="/cover.jpg" title="Dune" />);
    assert.ok(container.querySelector('.book-cover__spine'));
    assert.strictEqual(container.querySelector('.book-cover__pages'), null);

    rerender(<BookCover variant="comic" src="/cover.jpg" title="Action Comics" />);
    assert.strictEqual(container.querySelector('.book-cover__spine'), null);
    assert.ok(container.querySelector('.book-cover--comic'));
    assert.ok(container.querySelector('.book-cover__body > .book-cover__pages'));
  });

  it('keeps badges on the cover and overlay controls off it', () => {
    const { container } = render(
      <BookCover title="Dune" overlay={<button>Want</button>}>
        <span>#1</span>
      </BookCover>
    );

    assert.ok(container.querySelector('.book-cover__front')?.contains(screen.getByText('#1')));
    const button = screen.getByRole('button', { name: 'Want' });
    assert.ok(container.querySelector('.book-cover__overlay')?.contains(button));
    assert.ok(!container.querySelector('.book-cover__body')?.contains(button));
  });
});
