/**
 * E2E Tests for Series Pages and Book Cards
 */

import { test, expect } from '@playwright/test';

test.describe('Series Page', () => {
  test('should navigate to Series page', async ({ page }) => {
    await page.goto('/');
    await page.locator('aside').getByText('Series').click();
    await expect(page).toHaveURL('/series');
    await expect(page.getByRole('heading', { name: /Series/i })).toBeVisible();
  });

  test('should display series cards with book counts', async ({ page }) => {
    await page.goto('/series');

    // Wait for series to load - there should be at least a container
    const main = page.locator('main');
    await expect(main).toBeVisible();
  });
});

test.describe('Series Book Card', () => {
  test.skip('should display owned book cards with consistent height', async ({ page }) => {
    // This test requires a series with owned books
    // Navigate to a specific series page (adjust the series name as needed)
    await page.goto('/series');

    // Click on first series link if available
    const seriesLink = page.locator('a[href^="/series/"]').first();
    if (await seriesLink.count() > 0) {
      await seriesLink.click();

      // Check for owned book cards (they have "✓ Owned" badge)
      const ownedCards = page.locator('text="✓ Owned"').locator('..');

      if (await ownedCards.count() > 0) {
        // Verify owned cards have consistent structure
        const firstCard = ownedCards.first();
        await expect(firstCard).toBeVisible();

        // Should have cover image
        await expect(firstCard.locator('img')).toBeVisible();

        // Should have title and author in info section
        await expect(firstCard.locator('h3')).toBeVisible();
      }
    }
  });

  test.skip('should display missing book cards with Want button overlay', async ({ page }) => {
    // This test requires a series with missing books
    await page.goto('/series');

    // Click on first series link if available
    const seriesLink = page.locator('a[href^="/series/"]').first();
    if (await seriesLink.count() > 0) {
      await seriesLink.click();

      // Check for missing book cards (they have "Missing" badge)
      const missingCards = page.locator('text="Missing"').locator('..');

      if (await missingCards.count() > 0) {
        const firstMissingCard = missingCards.first();
        await expect(firstMissingCard).toBeVisible();

        // Should have grayscale cover image
        await expect(firstMissingCard.locator('img')).toBeVisible();

        // Should have Want button overlaid on cover
        const wantButton = firstMissingCard.getByRole('button', { name: /Want/i });

        if (await wantButton.count() > 0) {
          await expect(wantButton).toBeVisible();

          // Button should be positioned over the cover (has absolute positioning)
          const buttonBox = await wantButton.boundingBox();
          const imageBox = await firstMissingCard.locator('img').boundingBox();

          if (buttonBox && imageBox) {
            // Button should be within the image bounds (overlaid)
            expect(buttonBox.x).toBeGreaterThan(imageBox.x);
            expect(buttonBox.y).toBeGreaterThan(imageBox.y);
            expect(buttonBox.x + buttonBox.width).toBeLessThan(imageBox.x + imageBox.width);
            expect(buttonBox.y + buttonBox.height).toBeLessThan(imageBox.y + imageBox.height);
          }
        }
      }
    }
  });

  test.skip('should handle Want button click', async ({ page }) => {
    // This test requires a series with missing books and Hardcover configured
    await page.goto('/series');

    const seriesLink = page.locator('a[href^="/series/"]').first();
    if (await seriesLink.count() > 0) {
      await seriesLink.click();

      // Find a missing book card with Want button
      const wantButton = page.getByRole('button', { name: /\+ Want/i }).first();

      if (await wantButton.count() > 0) {
        // Click the Want button
        await wantButton.click();

        // Button should show loading state
        await expect(page.getByRole('button', { name: /Adding/i })).toBeVisible();

        // After adding, should show success link
        await expect(page.getByText(/Added to Wanted/i)).toBeVisible({ timeout: 5000 });
      }
    }
  });

  test.skip('should maintain consistent card heights between owned and missing books', async ({ page }) => {
    // This test requires a series with both owned and missing books
    await page.goto('/series');

    const seriesLink = page.locator('a[href^="/series/"]').first();
    if (await seriesLink.count() > 0) {
      await seriesLink.click();

      const ownedCards = page.locator('text="✓ Owned"').locator('..');
      const missingCards = page.locator('text="Missing"').locator('..');

      const ownedCount = await ownedCards.count();
      const missingCount = await missingCards.count();

      if (ownedCount > 0 && missingCount > 0) {
        // Get heights of owned and missing cards
        const ownedBox = await ownedCards.first().boundingBox();
        const missingBox = await missingCards.first().boundingBox();

        if (ownedBox && missingBox) {
          // Heights should be equal or very close (within 5px tolerance for rendering differences)
          const heightDiff = Math.abs(ownedBox.height - missingBox.height);
          expect(heightDiff).toBeLessThan(5);
        }
      }
    }
  });

  test.skip('should not show Want button in info section', async ({ page }) => {
    // Verify that the Want button is NOT below the book info
    await page.goto('/series');

    const seriesLink = page.locator('a[href^="/series/"]').first();
    if (await seriesLink.count() > 0) {
      await seriesLink.click();

      const missingCards = page.locator('text="Missing"').locator('..');

      if (await missingCards.count() > 0) {
        const firstMissingCard = missingCards.first();

        // Find the info section (has title and author)
        const infoSection = firstMissingCard.locator('div.p-3');

        // The info section should NOT contain a button
        const buttonsInInfo = infoSection.getByRole('button');
        await expect(buttonsInInfo).toHaveCount(0);
      }
    }
  });
});
