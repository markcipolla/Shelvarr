/**
 * Builds a demo library for screenshots.
 *
 *   DATA_DIR=/tmp/shelvarr-demo npx tsx scripts/demo/seed.ts
 *
 * Everything in it is in the public domain: classic novels with covers from
 * OpenLibrary, and Golden Age comics whose covers come from Wikimedia Commons.
 * Book covers are hot-linked, the way a real metadata match leaves them;
 * comic covers are fetched once and stored, as adding a volume from ComicVine
 * does. Keep book covers off Commons: it refuses Android's default user agent,
 * so they would come out blank in Stackarr.
 *
 * Leaves a session token for the demo admin in $DATA_DIR/demo-session-token,
 * which screenshots.ts signs the browser in with — there is no mail server to
 * send a sign-in code through.
 */

import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  initDatabase,
  execute,
  insertReturning,
  createUser,
  createSessionRecord,
  addComicRootFolder,
  upsertManagedComicVolume,
  replaceComicIssuesFromMetadata,
  upsertComicFile,
  linkComicFileToIssues,
  refreshComicVolumeStats,
  query,
  setSetting,
  isoToSqlTime,
} from '@shelvarr/db';
import { generateToken, hashToken } from '@shelvarr/services/auth/tokens';

interface DemoBook {
  title: string;
  author: string;
  series: string | null;
  position: number | null;
  year: number | null;
  isbn: string | null;
  publisher: string | null;
  openLibraryKey: string | null;
  coverUrl: string;
  description: string;
}

interface DemoComic {
  title: string;
  publisher: string;
  year: number;
  firstIssue: number;
  lastIssue: number;
  coverUrl: string;
  coverSource: string;
}

interface DemoWanted {
  title: string;
  author: string;
  isbn: string | null;
  coverUrl: string;
}

const library = JSON.parse(readFileSync(join(import.meta.dirname, 'library.json'), 'utf8')) as {
  books: DemoBook[];
  comics: DemoComic[];
  wanted: DemoWanted[];
};

const dataDir = process.env.DATA_DIR;
if (!dataDir) throw new Error('Set DATA_DIR to the directory the demo server will use.');
rmSync(dataDir, { recursive: true, force: true });
mkdirSync(dataDir, { recursive: true });
initDatabase(join(dataDir, 'shelvarr.db'));

const USER_AGENT = 'Shelvarr demo seed (https://github.com/markcipolla/shelvarr)';

/** SQLite's CURRENT_TIMESTAMP format, `minutesAgo` in the past. */
function ago(minutesAgo: number): string {
  return isoToSqlTime(new Date(Date.now() - minutesAgo * 60_000).toISOString())!;
}

/** A stable pseudo-random number in [0, 1) for a string, so reruns match. */
function noise(seed: string): number {
  let h = 2166136261;
  for (const ch of seed) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return ((h >>> 0) % 10_000) / 10_000;
}

// ── Accounts ────────────────────────────────────────────────────────────────

const admin = createUser('alex@example.com', 'Alex', 'admin');
createUser('sam@example.com', 'Sam', 'user');
createUser('jordan@example.com', 'Jordan', 'user');

// A mail server, so Settings → Users isn't a wall of "codes can't be sent".
// Nothing is ever sent: the demo server has no network.
setSetting('smtp_host', 'smtp.example.com');
setSetting('smtp_port', 587);
setSetting('smtp_from', 'Shelvarr <shelvarr@example.com>');

const token = generateToken();
createSessionRecord({
  userId: admin.id,
  tokenHash: hashToken(token),
  client: 'web',
  label: 'Demo browser',
  ttlSeconds: 86_400,
});

// ── Books ───────────────────────────────────────────────────────────────────

const ebooks = insertReturning<{ id: number }>(
  `INSERT INTO libraries (name, path, type) VALUES ('Ebooks', '/libraries/ebooks', 'book') RETURNING id`
)!.id;

// Newest first on the home page, so the order here is what "Recently Added" shows.
const recentlyAdded = [
  'A Princess of Mars',
  'The Wonderful Wizard of Oz',
  'Dracula',
  'The Hound of the Baskervilles',
  'The War of the Worlds',
  'Frankenstein',
  'The Gods of Mars',
  'Tarzan of the Apes',
  'Ozma of Oz',
  'The Time Machine',
  'The Memoirs of Sherlock Holmes',
  'The Call of the Wild',
];

const bookIds = new Map<string, number>();
library.books.forEach((book, index) => {
  const rank = recentlyAdded.indexOf(book.title);
  const minutesAgo = rank === -1 ? 60 * 24 * 30 + index * 90 : 30 + rank * 45;
  const folder = `/libraries/ebooks/${book.author}/${book.title}`;

  const row = insertReturning<{ id: number }>(
    `INSERT INTO books (
       library_id, file_path, file_hash, file_size, extension, title, authors,
       series, series_name, series_number, isbn, publisher, publish_date,
       description, cover_url, metadata_source, metadata_id, created_at, updated_at
     ) VALUES (?, ?, ?, ?, 'epub', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     RETURNING id`,
    [
      ebooks,
      `${folder}/${book.title} - ${book.author}.epub`,
      `demo-${index}`,
      Math.round(300_000 + noise(book.title) * 1_400_000),
      book.title,
      JSON.stringify([book.author]),
      book.series ? JSON.stringify([[book.series, book.position]]) : null,
      book.series,
      book.position,
      book.isbn,
      book.publisher,
      book.year ? String(book.year) : null,
      book.description || null,
      book.coverUrl,
      'openlibrary',
      book.openLibraryKey,
      ago(minutesAgo),
      ago(minutesAgo),
    ]
  );
  bookIds.set(book.title, row!.id);
});

// One real file, so the reader has something to open: Project Gutenberg's
// A Princess of Mars. The rest of the library is metadata only.
const READABLE = 'A Princess of Mars';
const readablePath = join(dataDir, 'books', `${READABLE}.epub`);
const epub = await fetch('https://www.gutenberg.org/ebooks/62.epub3.images', {
  headers: { 'User-Agent': USER_AGENT },
});
if (epub.ok) {
  mkdirSync(join(dataDir, 'books'), { recursive: true });
  writeFileSync(readablePath, Buffer.from(await epub.arrayBuffer()));
  execute('UPDATE books SET file_path = ? WHERE id = ?', [readablePath, bookIds.get(READABLE)]);
} else {
  console.warn(`Gutenberg returned ${epub.status}; the reader will have nothing to open.`);
}

const reading: Array<[string, number, number]> = [
  ['The Hound of the Baskervilles', 0.42, 20],
  ['A Princess of Mars', 0.67, 240],
  ['Twenty Thousand Leagues Under the Seas', 0.18, 60 * 26],
  ['Dracula', 0.81, 60 * 50],
  ['Frankenstein', 0.33, 60 * 74],
  ['Treasure Island', 0.56, 60 * 98],
];
for (const [title, progression, minutesAgo] of reading) {
  execute(
    `INSERT INTO epub_progression (book_id, user_id, device_id, locator, progression, created_at, updated_at)
     VALUES (?, ?, 'demo', '{}', ?, ?, ?)`,
    [bookIds.get(title), admin.id, progression, ago(minutesAgo), ago(minutesAgo)]
  );
}

const finished = [
  'A Study in Scarlet',
  'The Sign of the Four',
  'The Adventures of Sherlock Holmes',
  'The Wonderful Wizard of Oz',
  'Pride and Prejudice',
  'The Time Machine',
];
for (const title of finished) {
  execute(
    'INSERT INTO read_progress (book_id, user_id, page, completed) VALUES (?, ?, 0, 1)',
    [bookIds.get(title), admin.id]
  );
}

// ── Authors and their bibliographies ────────────────────────────────────────

const bibliographies: Record<string, Array<[string, number]>> = {
  'Arthur Conan Doyle': [
    ['A Study in Scarlet', 1887],
    ['Micah Clarke', 1889],
    ['The Sign of the Four', 1890],
    ['The White Company', 1891],
    ['The Adventures of Sherlock Holmes', 1892],
    ['The Memoirs of Sherlock Holmes', 1894],
    ['The Hound of the Baskervilles', 1902],
    ['The Return of Sherlock Holmes', 1905],
    ['The Lost World', 1912],
    ['The Valley of Fear', 1915],
    ['His Last Bow', 1917],
    ['The Case-Book of Sherlock Holmes', 1927],
  ],
  'Edgar Rice Burroughs': [
    ['A Princess of Mars', 1912],
    ['Tarzan of the Apes', 1912],
    ['The Gods of Mars', 1913],
    ['The Return of Tarzan', 1913],
    ['The Warlord of Mars', 1914],
    ["At the Earth's Core", 1914],
    ['Thuvia, Maid of Mars', 1916],
    ['The Land That Time Forgot', 1918],
    ['The Chessmen of Mars', 1922],
  ],
  'H. G. Wells': [
    ['The Time Machine', 1895],
    ['The Island of Doctor Moreau', 1896],
    ['The Invisible Man', 1897],
    ['The War of the Worlds', 1898],
    ['When the Sleeper Wakes', 1899],
    ['The First Men in the Moon', 1901],
    ['The Food of the Gods', 1904],
    ['Kipps', 1905],
    ['Tono-Bungay', 1909],
  ],
  'Jane Austen': [
    ['Sense and Sensibility', 1811],
    ['Pride and Prejudice', 1813],
    ['Mansfield Park', 1814],
    ['Emma', 1815],
    ['Northanger Abbey', 1817],
    ['Persuasion', 1817],
  ],
  'L. Frank Baum': [
    ['The Wonderful Wizard of Oz', 1900],
    ['The Marvelous Land of Oz', 1904],
    ['Ozma of Oz', 1907],
    ['Dorothy and the Wizard in Oz', 1908],
    ['The Road to Oz', 1909],
    ['The Emerald City of Oz', 1910],
  ],
};

const wantedTitles = new Set(library.wanted.map((w) => w.title));
for (const [name, works] of Object.entries(bibliographies)) {
  const authorId = insertReturning<{ id: number }>(
    `INSERT INTO authors (name, total_works, last_synced) VALUES (?, ?, ?) RETURNING id`,
    [name, works.length, ago(60 * 5)]
  )!.id;
  for (const [title, year] of works) {
    const bookId = bookIds.get(title) ?? null;
    execute(
      `INSERT INTO author_works (author_id, title, publish_year, language, metadata_source, owned, book_id, wanted)
       VALUES (?, ?, ?, 'eng', 'openlibrary', ?, ?, ?)`,
      [authorId, title, year, bookId ? 1 : 0, bookId, wantedTitles.has(title) ? 1 : 0]
    );
  }
}

// ── Wanted ──────────────────────────────────────────────────────────────────

const wantedStatus: Record<string, string> = {
  'The Valley of Fear': 'searching',
  'The Lost World': 'found',
};
library.wanted.forEach((want, index) => {
  execute(
    `INSERT INTO wanted_books (title, author, isbn, cover_url, added_at, priority, status)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      want.title,
      want.author,
      want.isbn,
      want.coverUrl,
      ago(60 * 24 * (index + 1)),
      index < 2 ? 1 : 0,
      wantedStatus[want.title] ?? 'wanted',
    ]
  );
});

// ── Comics ──────────────────────────────────────────────────────────────────

const root = addComicRootFolder('/libraries/comics');

async function fetchCover(url: string): Promise<Buffer | null> {
  const response = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
  if (!response.ok) {
    console.warn(`Cover ${url} returned ${response.status}; leaving it blank.`);
    return null;
  }
  return Buffer.from(await response.arrayBuffer());
}

// How much of each run is on disk. The rest shows up as missing issues.
const owned: Record<string, number> = {
  "America's Best Comics": 0.8,
  'Black Cat': 1,
  'Doll Man': 1,
  'Amazing-Man Comics': 1,
};

const volumeIds = new Map<string, number>();
for (const [index, comic] of library.comics.entries()) {
  const comicvineId = 90_000 + index;
  const folder = `${comic.title} (${comic.year})`;
  const issueCount = comic.lastIssue - comic.firstIssue + 1;
  const issues = Array.from({ length: issueCount }, (_, i) => {
    const number = comic.firstIssue + i;
    const month = (i % 12) + 1;
    const year = comic.year + Math.floor(i / 12);
    return {
      comicvineId: comicvineId * 1000 + number,
      volumeComicvineId: comicvineId,
      issueNumber: String(number),
      calculatedIssueNumber: number,
      title: null,
      date: `${year}-${String(month).padStart(2, '0')}-01`,
      description: '',
    };
  });

  const volumeId = upsertManagedComicVolume({
    metadata: {
      comicvineId,
      title: comic.title,
      year: comic.year,
      volumeNumber: 1,
      publisher: comic.publisher,
      description: `${comic.title}, published by ${comic.publisher} from ${comic.year}. Golden Age comics now in the public domain.`,
      coverLink: comic.coverUrl,
      siteUrl: comic.coverSource,
      aliases: [],
      issueCount,
      translated: false,
      issues,
    },
    rootFolderId: root.id,
    folder: `/libraries/comics/${folder}`,
    cover: await fetchCover(comic.coverUrl),
  });
  volumeIds.set(comic.title, volumeId);
  replaceComicIssuesFromMetadata(volumeId, issues);

  const share = owned[comic.title] ?? 0.2 + noise(comic.title) * 0.6;
  const have = Math.max(1, Math.round(issueCount * share));
  const rows = query<{ id: number; issue_number: string }>(
    'SELECT id, issue_number FROM comic_issues WHERE volume_id = ? ORDER BY calculated_issue_number',
    [volumeId]
  );
  for (const issue of rows.slice(0, have)) {
    const number = issue.issue_number.padStart(3, '0');
    const fileId = upsertComicFile({
      volumeId,
      filepath: `/libraries/comics/${folder}/${comic.title} (${comic.year}) #${number}.cbz`,
      size: Math.round(25_000_000 + noise(`${comic.title}${number}`) * 40_000_000),
    });
    linkComicFileToIssues(fileId, [issue.id]);
  }
  refreshComicVolumeStats(volumeId);
  // Stagger "Recently Added Comics".
  execute('UPDATE comics SET cached_at = ?, updated_at = ? WHERE id = ?', [
    ago(20 + index * 30),
    ago(20 + index * 30),
    volumeId,
  ]);
}

function issueId(title: string, number: number): number {
  return query<{ id: number }>(
    'SELECT id FROM comic_issues WHERE volume_id = ? AND calculated_issue_number = ?',
    [volumeIds.get(title), number]
  )[0]!.id;
}

// One real issue, so Stackarr's comic reader has pages to turn: "Artist of
// Evil", the eight-page story from Adventures into the Unknown #36 (1952),
// whose scans are on Commons. Packed with the system `zip`, stored rather than
// compressed, the way CBZs usually are.
const READABLE_COMIC: [string, number] = ['Adventures into the Unknown', 36];
const comicDir = join(dataDir, 'comics');
const pageDir = join(comicDir, 'pages');
mkdirSync(pageDir, { recursive: true });
const pageFiles = [
  'ArtistOfEvil001.jpg',
  'AritistOfEvil002.jpg', // sic, on Commons
  'ArtistOfEvil003.jpg',
  'ArtistOfEvil004.jpg',
  'ArtistOfEvil005.jpg',
  'ArtistOfEvil006.jpg',
  'ArtistOfEvil007.jpg',
  'ArtistOfEvil008.jpg',
];
const pagesFetched = await Promise.all(
  pageFiles.map(async (file, index) => {
    const response = await fetch(`https://commons.wikimedia.org/wiki/Special:FilePath/${file}`, {
      headers: { 'User-Agent': USER_AGENT },
    });
    if (!response.ok) return false;
    const name = `${String(index + 1).padStart(3, '0')}.jpg`;
    writeFileSync(join(pageDir, name), Buffer.from(await response.arrayBuffer()));
    return true;
  })
);
if (pagesFetched.every(Boolean)) {
  const cbz = join(comicDir, `${READABLE_COMIC[0]} #036.cbz`);
  const pagePaths = pageFiles.map((_, i) => join(pageDir, `${String(i + 1).padStart(3, '0')}.jpg`));
  execFileSync('zip', ['-q', '-0', '-j', cbz, ...pagePaths]);
  execute(
    `UPDATE comic_files SET filepath = ?, size = ?
      WHERE id = (SELECT file_id FROM comic_issue_files WHERE issue_id = ?)`,
    [cbz, statSync(cbz).size, issueId(...READABLE_COMIC)]
  );
} else {
  console.warn('Commons would not hand over every page; the comic reader will have nothing to open.');
}
rmSync(pageDir, { recursive: true, force: true });

// Comics in progress, for the home page.
const comicReading: Array<[string, number, number, number]> = [
  ["America's Best Comics", 7, 18, 52],
  ['Black Cat', 12, 30, 48],
  [...READABLE_COMIC, 3, 8],
  ['Jungle Comics', 21, 40, 64],
  ['Whiz Comics', 9, 22, 68],
  ['Doll Man', 15, 5, 52],
];
comicReading.forEach(([title, number, page, total], index) => {
  execute(
    `INSERT INTO comic_read_progress (issue_id, user_id, page, completed, total, created_at, updated_at)
     VALUES (?, ?, ?, 0, ?, ?, ?)`,
    [issueId(title, number), admin.id, page, total, ago(10 + index * 90), ago(10 + index * 90)]
  );
  for (let earlier = 1; earlier < number; earlier++) {
    const id = query<{ id: number }>(
      'SELECT id FROM comic_issues WHERE volume_id = ? AND calculated_issue_number = ?',
      [volumeIds.get(title), earlier]
    )[0];
    if (!id) continue;
    execute(
      `INSERT INTO comic_read_progress (issue_id, user_id, page, completed, total) VALUES (?, ?, ?, 1, ?)`,
      [id.id, admin.id, total, total]
    );
  }
});

// A download queue with something in every state.
const downloads: Array<{
  title: string;
  number: number;
  state: string;
  host: string;
  progress?: number;
  size?: number;
  error?: string;
  minutesAgo: number;
}> = [
  { title: "America's Best Comics", number: 26, state: 'downloading', host: 'getcomics', progress: 31_500_000, size: 48_200_000, minutesAgo: 2 },
  { title: "America's Best Comics", number: 27, state: 'queued', host: 'getcomics', minutesAgo: 2 },
  { title: "America's Best Comics", number: 28, state: 'queued', host: 'pixeldrain', minutesAgo: 2 },
  { title: 'Crime Does Not Pay', number: 61, state: 'completed', host: 'getcomics', size: 41_800_000, minutesAgo: 35 },
  { title: 'Jungle Comics', number: 42, state: 'completed', host: 'pixeldrain', size: 52_300_000, minutesAgo: 80 },
  {
    title: 'Fight Comics',
    number: 50,
    state: 'failed',
    host: 'pixeldrain',
    error: 'Every link for this release is dead or blocklisted; the next search will try another.',
    minutesAgo: 190,
  },
];
for (const download of downloads) {
  const volumeId = volumeIds.get(download.title)!;
  const number = String(download.number).padStart(3, '0');
  const year = library.comics.find((c) => c.title === download.title)!.year;
  const slug = download.title.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  const name = `${download.title} (${year}) #${number}`;
  execute(
    `INSERT INTO comic_downloads (
       volume_id, issue_id, covered_issues, host, download_link, web_link, web_title,
       filename_body, state, progress, size, attempts, error, heartbeat_at, created_at, completed_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      volumeId,
      issueId(download.title, download.number),
      JSON.stringify(download.number),
      download.host,
      `https://example.invalid/${download.host}/${slug}-${number}.cbz`,
      `https://getcomics.org/other-comics/${slug}-${download.number}-${year}/`,
      `${download.title} #${download.number} (${year})`,
      name,
      download.state,
      download.progress ?? (download.state === 'completed' ? download.size ?? 0 : 0),
      download.size ?? null,
      download.state === 'failed' ? 5 : download.state === 'queued' ? 0 : 1,
      download.error ?? null,
      ago(download.state === 'downloading' ? 0 : download.minutesAgo),
      ago(download.minutesAgo),
      download.state === 'completed' || download.state === 'failed' ? ago(download.minutesAgo - 1) : null,
    ]
  );
}

// Earlier imports, for the History list.
for (const [index, [title, number]] of (
  [
    ['Crime Does Not Pay', 61],
    ['Jungle Comics', 42],
    ['Black Cat', 65],
    ['Doll Man', 47],
    ['Amazing-Man Comics', 26],
    ['Whiz Comics', 117],
  ] as Array<[string, number]>
).entries()) {
  const year = library.comics.find((c) => c.title === title)!.year;
  execute(
    `INSERT INTO comic_download_history
       (volume_id, issue_id, web_link, web_title, file_title, host, success, downloaded_at)
     VALUES (?, ?, ?, ?, ?, ?, 1, ?)`,
    [
      volumeIds.get(title),
      issueId(title, number),
      `https://getcomics.org/other-comics/${title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${number}-${year}/`,
      `${title} #${number} (${year})`,
      `${title} (${year}) #${String(number).padStart(3, '0')}.cbz`,
      index % 2 ? 'pixeldrain' : 'getcomics',
      ago(35 + index * 60 * 7),
    ]
  );
}

writeFileSync(join(dataDir, 'demo-session-token'), token);
console.log(`Demo library ready in ${dataDir}.`);
