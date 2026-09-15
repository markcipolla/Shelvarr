/**
 * Lays Stackarr's screenshots out in phone frames, as one banner for the
 * README, where there is no CSS to frame them with.
 *
 *   npx tsx scripts/demo/stackarr-poster.ts
 *
 * Reads the captures stackarr.ts leaves in out/stackarr, and writes
 * out/banner/stackarr.png.
 */

import { mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from '@playwright/test';

const outDir = process.env.OUT_DIR || join(import.meta.dirname, 'out');
const shotsDir = join(outDir, 'stackarr');

/** Left to right. The middle phone stands a little taller than the rest. */
const phones = ['books', 'home', 'comic-reader', 'reader', 'comic'];

const dataUrl = (file: string) =>
  `data:image/png;base64,${readFileSync(join(shotsDir, `${file}.png`)).toString('base64')}`;
const icon = readFileSync(join(import.meta.dirname, '..', '..', '..', '..', 'stackarr.svg'), 'utf8');

const html = `<!doctype html>
<html>
<head>
<style>
  * { box-sizing: border-box; margin: 0; }
  body {
    width: 1600px;
    height: 900px;
    overflow: hidden;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    background:
      radial-gradient(ellipse 70% 60% at 50% 100%, rgba(139, 94, 60, 0.55), transparent 70%),
      radial-gradient(ellipse 60% 50% at 50% 0%, #2b231b, transparent 70%),
      #1d1813;
    color: #f5f1eb;
  }
  header {
    position: absolute;
    top: 64px;
    left: 0;
    right: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 10px;
  }
  .brand { display: flex; align-items: center; gap: 16px; }
  .brand svg { width: 52px; height: 65px; fill: #f5f1eb; }
  .brand h1 { font-size: 56px; letter-spacing: -0.02em; font-weight: 700; }
  header p { font-size: 22px; color: #d8cdbe; }
  .phones {
    position: absolute;
    left: 0;
    right: 0;
    top: 250px;
    display: flex;
    justify-content: center;
    align-items: flex-start;
    gap: 36px;
  }
  .phone {
    width: 250px;
    border-radius: 38px;
    padding: 9px;
    background: #0d0b09;
    box-shadow:
      0 0 0 1.5px #3a3129,
      0 40px 80px -20px rgba(0, 0, 0, 0.8),
      0 20px 40px rgba(0, 0, 0, 0.45);
  }
  .phone img { display: block; width: 100%; border-radius: 30px; }
  .phone:nth-child(2), .phone:nth-child(4) { margin-top: 50px; }
  .phone:nth-child(1), .phone:nth-child(5) { margin-top: 110px; }
</style>
</head>
<body>
  <header>
    <div class="brand">${icon}<h1>Stackarr</h1></div>
    <p>Your Shelvarr library, in your pocket — and offline when you need it.</p>
  </header>
  <div class="phones">
    ${phones.map((name) => `<div class="phone"><img src="${dataUrl(name)}"></div>`).join('\n    ')}
  </div>
</body>
</html>`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 2 });
await page.setContent(html, { waitUntil: 'load' });
mkdirSync(join(outDir, 'banner'), { recursive: true });
await page.screenshot({ path: join(outDir, 'banner', 'stackarr.png') });
await browser.close();
console.log(`Wrote ${join(outDir, 'banner', 'stackarr.png')}`);
