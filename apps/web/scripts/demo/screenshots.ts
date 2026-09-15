/**
 * Screenshots of the demo library, for the README.
 *
 *   DATA_DIR=/tmp/shelvarr-demo npx tsx scripts/demo/screenshots.ts
 *
 * Expects a server already running against a database built by seed.ts, and
 * signs in with the session token seed.ts left beside it. BASE_URL points it
 * somewhere other than port 3917, OUT_DIR somewhere other than ./out, and ONLY
 * takes a comma-separated list of shot names to retake just those.
 */

import { mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium, type Page } from '@playwright/test';

const dataDir = process.env.DATA_DIR;
if (!dataDir) throw new Error('Set DATA_DIR to the directory seed.ts built the demo in.');
const token = readFileSync(join(dataDir, 'demo-session-token'), 'utf8').trim();
const baseURL = process.env.BASE_URL || 'http://localhost:3917';
const outDir = process.env.OUT_DIR || join(import.meta.dirname, 'out');
mkdirSync(outDir, { recursive: true });

interface Shot {
  name: string;
  path: string;
  /** Taller than the default 900px, for pages worth seeing more of. */
  height?: number;
  prepare?: (page: Page) => Promise<void>;
}

// Ids follow the order of library.json: book 5 is The Hound of the
// Baskervilles, book 10 A Princess of Mars (the one with a real EPUB), and
// author 1 Arthur Conan Doyle.
const shots: Shot[] = [
  { name: 'home', path: '/', height: 960 },
  { name: 'books', path: '/books' },
  { name: 'book', path: '/books/5' },
  {
    name: 'reader',
    path: '/books/10',
    prepare: async (page) => {
      await page.getByRole('button', { name: 'Read', exact: true }).click();
      const frame = page.frameLocator('iframe').first();
      await frame.locator('body').waitFor();
      // Past the cover and front matter, onto the first page of prose.
      for (let i = 0; i < 6; i++) {
        await page.keyboard.press('ArrowRight');
        await page.waitForTimeout(400);
      }
    },
  },
  { name: 'series-detail', path: '/series/Sherlock%20Holmes' },
  { name: 'author', path: '/authors/1' },
  { name: 'comics', path: '/comics' },
  { name: 'comic', path: '/comics/americas-best-comics-1942' },
  { name: 'comic-downloads', path: '/comics/downloads' },
  { name: 'settings-users', path: '/settings/users' },
  { name: 'settings-comics', path: '/settings/comics' },
];

const only = process.env.ONLY?.split(',');

const browser = await chromium.launch();
for (const shot of shots) {
  if (only && !only.includes(shot.name)) continue;
  const context = await browser.newContext({
    viewport: { width: 1440, height: shot.height ?? 900 },
    deviceScaleFactor: 2,
    colorScheme: 'dark',
  });
  await context.addCookies([{ name: 'shelvarr_session', value: token, url: baseURL }]);
  const page = await context.newPage();
  await page.goto(baseURL + shot.path, { waitUntil: 'networkidle' });
  await shot.prepare?.(page);
  // Covers load lazily; wait for every image that has started to finish.
  await page.evaluate(async () => {
    await Promise.all(
      Array.from(document.images)
        .filter((img) => !img.complete)
        .map(
          (img) =>
            new Promise((resolve) => {
              img.addEventListener('load', resolve, { once: true });
              img.addEventListener('error', resolve, { once: true });
            })
        )
    );
  });
  // The viewport, not the full page: the app scrolls its own main column, so a
  // full-page capture comes out the same size anyway.
  await page.screenshot({ path: join(outDir, `${shot.name}.png`) });
  console.log(`${shot.name} → ${page.url()}`);
  await context.close();
}
await browser.close();
