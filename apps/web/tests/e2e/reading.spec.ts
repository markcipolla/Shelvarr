/**
 * E2E Tests for Reading
 *
 * There is no seeded book or comic in the empty database every spec starts
 * from (see auth.setup.ts), so there is nothing to actually open a reader
 * against here. `apps/web/scripts/demo/seed.ts` builds a fixture library with
 * real readable files, but it fetches an EPUB from Gutenberg and comic pages
 * from Wikimedia Commons over the network and shells out to the system `zip`
 * — too much for a single spec's `beforeEach` to depend on without risking
 * this suite's speed and flake budget. A real open-a-reader-and-see-a-page
 * test is a reasonable follow-up once a lighter fixture exists.
 *
 * What is honestly testable here: the reading APIs fail cleanly instead of
 * crashing when asked for data that does not exist, and no reader entry
 * point renders when there is nothing in the library to read.
 */

import { test, expect } from '@playwright/test';

test.describe('Reading API - missing data', () => {
  test('book file endpoint 404s for a nonexistent book, not 500', async ({ request }) => {
    const response = await request.get('/api/books/99999999/file');
    expect(response.status()).toBe(404);
    const body = await response.json();
    expect(body).toHaveProperty('error');
  });

  test('book file endpoint 400s for a malformed id', async ({ request }) => {
    const response = await request.get('/api/books/not-a-number/file');
    expect(response.status()).toBe(400);
  });

  test('comic issue pages endpoint 404s for a nonexistent issue, not 500', async ({ request }) => {
    const response = await request.get('/api/comics/issues/99999999/pages');
    expect(response.status()).toBe(404);
    const body = await response.json();
    expect(body).toHaveProperty('error');
  });

  test('comic issue pages endpoint 400s for a malformed id', async ({ request }) => {
    const response = await request.get('/api/comics/issues/not-a-number/pages');
    expect(response.status()).toBe(400);
  });
});

test.describe('Reading entry points - empty library', () => {
  test('home page has no book to resume reading', async ({ page }) => {
    await page.goto('/');

    // HomePage renders this exact message in place of the Currently Reading
    // row when there is nothing in progress (app/(app)/page.tsx).
    await expect(
      page.getByText('No books in progress. Open a book to start reading.')
    ).toBeVisible();

    // "Currently Reading Comics" only renders at all once a comic is in
    // progress, so its absence is itself the assertion.
    await expect(page.getByRole('heading', { name: 'Currently Reading Comics' })).toHaveCount(0);

    // BookCard and ComicCard (the only things that link into a reader) both
    // render with this class; an empty library has none of them anywhere on
    // the page, home included.
    await expect(page.locator('.book-cover-trigger')).toHaveCount(0);
  });

  test('books page has no covers to open a reader from', async ({ page }) => {
    await page.goto('/books');
    await expect(page.locator('.book-cover-trigger')).toHaveCount(0);
  });

  test('comics page has no covers to open a reader from', async ({ page }) => {
    await page.goto('/comics');
    await expect(page.locator('.book-cover-trigger')).toHaveCount(0);
  });
});
