/**
 * Stackarr's screenshots, from an Android emulator signed in to the demo
 * server.
 *
 *   DATA_DIR=/tmp/shelvarr-demo npx tsx scripts/demo/stackarr.ts
 *
 * Expects an emulator with Stackarr installed (ANDROID_SERIAL picks one; the
 * default is emulator-5554), and the demo server on port 3917 writing its log
 * to $DATA_DIR/server.log — the sign-in code is read out of it, since there is
 * no mail server. Wipes the app's data first, so it always starts from the
 * welcome screen. Captures land in out/stackarr.
 *
 * Everything is found by its on-screen text, through uiautomator, so a
 * renamed button is the likeliest thing to break it.
 */

import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import Database from 'better-sqlite3';

const dataDir = process.env.DATA_DIR;
if (!dataDir) throw new Error('Set DATA_DIR to the directory seed.ts built the demo in.');
const serial = process.env.ANDROID_SERIAL || 'emulator-5554';
const outDir = join(process.env.OUT_DIR || join(import.meta.dirname, 'out'), 'stackarr');
mkdirSync(outDir, { recursive: true });

const APP = 'com.stackarr.app';
// The emulator's name for the host machine.
const SERVER = 'http://10.0.2.2:3917';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function adb(...args: string[]): Buffer {
  return execFileSync('adb', ['-s', serial, ...args], {
    maxBuffer: 64 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'ignore'],
  });
}

interface UiNode {
  text: string;
  /** The centre, which is where a tap lands. */
  x: number;
  y: number;
}

/** Everything on screen with text or a content description, and its centre. */
function screen(): UiNode[] {
  adb('shell', 'uiautomator', 'dump', '/sdcard/ui.xml');
  const xml = adb('exec-out', 'cat', '/sdcard/ui.xml').toString();
  const nodes: UiNode[] = [];
  for (const match of xml.matchAll(/<node [^>]*>/g)) {
    const attr = (name: string) => match[0].match(new RegExp(`${name}="([^"]*)"`))?.[1] ?? '';
    const text = attr('text') || attr('content-desc');
    const bounds = attr('bounds').match(/\d+/g)?.map(Number);
    if (text && bounds?.length === 4) {
      const [left, top, right, bottom] = bounds as [number, number, number, number];
      nodes.push({ text, x: (left + right) >> 1, y: (top + bottom) >> 1 });
    }
  }
  return nodes;
}

/** Wait for text to appear, and return where it is. */
async function find(text: string, { lowest = false } = {}): Promise<UiNode> {
  for (let attempt = 0; attempt < 15; attempt++) {
    const hits = screen().filter((node) => node.text.includes(text));
    if (hits.length) return lowest ? hits.reduce((a, b) => (b.y > a.y ? b : a)) : hits[0]!;
    await sleep(1000);
  }
  throw new Error(`Never saw "${text}" on screen.`);
}

/** Tap text. `lowest` picks the tab bar's label over a heading with the same words. */
async function tap(text: string, options?: { lowest?: boolean }): Promise<void> {
  const node = await find(text, options);
  adb('shell', 'input', 'tap', String(node.x), String(node.y));
  await sleep(800);
}

function type(text: string): void {
  adb('shell', 'input', 'text', text);
}

async function shot(name: string): Promise<void> {
  await sleep(2500); // covers
  writeFileSync(join(outDir, `${name}.png`), adb('exec-out', 'screencap', '-p'));
  console.log(`stackarr/${name}.png`);
}

const [width, height] = adb('shell', 'wm', 'size')
  .toString()
  .match(/(\d+)x(\d+)/)!
  .slice(1)
  .map(Number) as [number, number];

// A clean status bar: 9:41, full battery and wifi, no notifications.
adb('shell', 'settings', 'put', 'global', 'sysui_demo_allowed', '1');
for (const command of [
  ['enter'],
  ['clock', '-e', 'hhmm', '0941'],
  ['battery', '-e', 'level', '100', '-e', 'plugged', 'false'],
  ['network', '-e', 'mobile', 'hide'],
  ['network', '-e', 'wifi', 'show', '-e', 'level', '4', '-e', 'fully', 'true'],
  ['notifications', '-e', 'visible', 'false'],
]) {
  adb('shell', 'am', 'broadcast', '-a', 'com.android.systemui.demo', '-e', 'command', ...command);
}

// Sign-in codes only reach the log while no mail server is configured, so the
// demo's pretend one steps aside until the code has been sent.
const db = new Database(join(dataDir, 'shelvarr.db'));
const mailSettings = db.prepare("SELECT key, value FROM settings WHERE key LIKE 'smtp_%'").all();
db.prepare("DELETE FROM settings WHERE key LIKE 'smtp_%'").run();

adb('shell', 'pm', 'clear', APP);
adb('shell', 'monkey', '-p', APP, '-c', 'android.intent.category.LAUNCHER', '1');

await tap('Get started');
await tap('192.168'); // the server address field's placeholder
type(SERVER);
await tap('Connect');
await tap('you@example.com');
type('alex@example.com');
await tap('Email me a code');
await find('Check your email');
const restore = db.prepare('INSERT INTO settings (key, value) VALUES (@key, @value)');
for (const row of mailSettings) restore.run(row);
db.close();

const log = readFileSync(join(dataDir, 'server.log'), 'utf8');
const code = [...log.matchAll(/as alex@example\.com: ([A-Z0-9]{6})/g)].at(-1)?.[1];
if (!code) throw new Error(`No sign-in code in ${join(dataDir, 'server.log')}.`);
// One box per character, and each wants its own tap.
const boxes = screen().filter((node) => /^Character \d of 6$/.test(node.text));
for (const [index, box] of boxes.entries()) {
  adb('shell', 'input', 'tap', String(box.x), String(box.y));
  type(code[index]!);
  await sleep(300);
}
await tap('Start reading');

await find('IN PROGRESS COMICS');
await shot('home');

await tap('Books', { lowest: true });
await shot('books');

await tap('Comics', { lowest: true });
await tap("America's Best Comics");
await shot('comic');
adb('shell', 'input', 'keyevent', 'KEYCODE_BACK');

// Adventures into the Unknown #36 is the one issue with real pages.
await tap('Adventures into the Unknown');
for (let swipes = 0; !screen().some((node) => node.text.startsWith('#36, ')); swipes++) {
  if (swipes > 15) throw new Error('Scrolled past the end of the issue list without finding #36.');
  const x = String(width >> 1);
  adb('shell', 'input', 'swipe', x, String(height * 0.8), x, String(height * 0.3), '300');
  await sleep(800);
}
await tap('#36, ');
await tap('Read comic issue');
await find(' / 8');
await shot('comic-reader');
adb('shell', 'input', 'keyevent', 'KEYCODE_BACK');
adb('shell', 'input', 'keyevent', 'KEYCODE_BACK');
adb('shell', 'input', 'keyevent', 'KEYCODE_BACK');

// A Princess of Mars is the one book with a real EPUB. Page on past the
// cover, contents and foreword: the chapter title first shows up on the
// opening page of Chapter I, which starts a page on any screen size.
await tap('Books', { lowest: true });
await tap('A Princess of Mars');
await tap('Read');
if (screen().some((node) => node.text === 'Got it')) await tap('Got it');
await find('Ch '); // the chapter counter, once the book has opened
await sleep(1500);
for (let pages = 0; !screen().some((node) => node.text.includes('ARIZONA HILLS')); pages++) {
  if (pages > 30) throw new Error('Paged through the front matter without reaching Chapter I.');
  await tap('→');
}
await shot('reader');
