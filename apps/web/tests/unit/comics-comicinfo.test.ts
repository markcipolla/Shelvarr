/**
 * ComicInfo.xml: parsing it, reading it back out of a real archive, and the
 * scanner preferring it to the filename.
 *
 * The parser tests are pure string in, object out — that is the whole point
 * of `parseComicInfo` being separate from the archive handling. The archive
 * and scanner tests build real CBZ files with fflate rather than mocking the
 * extraction, because the extraction is what is under test.
 */
import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { zipSync } from 'fflate';
import type { ComicIssueMetadata, ComicVolumeMetadata, FilenameData } from '@shelvarr/types';

import {
  applyComicInfo,
  parseComicInfo,
  readComicInfo,
} from '@shelvarr/services/comics/comicinfo';

// ---------------------------------------------------------------------------
// parseComicInfo
// ---------------------------------------------------------------------------

/** A ComicInfo.xml as ComicRack actually writes one, trimmed to our fields. */
const REALISTIC = `<?xml version="1.0"?>
<ComicInfo xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema">
  <Title>The Hulk Is Not a Monster</Title>
  <Series>Immortal Hulk</Series>
  <Number>3</Number>
  <Count>50</Count>
  <Volume>2018</Volume>
  <Summary>Bruce Banner is alive.</Summary>
  <Year>2018</Year>
  <Month>8</Month>
  <Writer>Al Ewing</Writer>
  <Penciller>Joe Bennett</Penciller>
  <Publisher>Marvel</Publisher>
  <PageCount>22</PageCount>
</ComicInfo>`;

describe('parseComicInfo', () => {
  it('reads a realistic ComicRack document', () => {
    assert.deepEqual(parseComicInfo(REALISTIC), {
      series: 'Immortal Hulk',
      volumeNumber: null,
      year: 2018,
      number: '3',
      title: 'The Hulk Is Not a Monster',
    });
  });

  it('treats a four-digit Volume as the year and anything else as a number', () => {
    // The wild disagrees about <Volume>: ComicRack's schema means "which
    // volume of the series", ComicVine-derived tooling writes the start year.
    assert.equal(parseComicInfo('<ComicInfo><Volume>2016</Volume></ComicInfo>')?.year, 2016);
    assert.equal(
      parseComicInfo('<ComicInfo><Volume>2016</Volume></ComicInfo>')?.volumeNumber,
      null
    );

    const numbered = parseComicInfo('<ComicInfo><Volume>2</Volume></ComicInfo>');
    assert.equal(numbered?.volumeNumber, 2);
    assert.equal(numbered?.year, null);
  });

  it('prefers an explicit Year over a Volume that looks like one', () => {
    const info = parseComicInfo('<ComicInfo><Volume>1940</Volume><Year>1962</Year></ComicInfo>');
    assert.equal(info?.year, 1962);
  });

  it('resolves entities and numeric character references', () => {
    const info = parseComicInfo(
      `<ComicInfo><Series>Archie &amp; Friends</Series>` +
        `<Title>&quot;Who&apos;s There?&quot; &#8212; Part &#x31;</Title>` +
        `<Number>&lt;1&gt;</Number></ComicInfo>`
    );
    assert.equal(info?.series, 'Archie & Friends');
    assert.equal(info?.title, '"Who\'s There?" — Part 1');
    assert.equal(info?.number, '<1>');
  });

  it('takes CDATA literally rather than unescaping inside it', () => {
    const info = parseComicInfo(
      '<ComicInfo><Series><![CDATA[Tom & Jerry &amp; Friends]]></Series></ComicInfo>'
    );
    assert.equal(info?.series, 'Tom & Jerry &amp; Friends');
  });

  it('tolerates attributes, namespace prefixes and self-closing elements', () => {
    const info = parseComicInfo(
      `<ci:ComicInfo xmlns:ci="urn:comicinfo">` +
        `<ci:Series lang="en">Saga</ci:Series><ci:Number/><ci:Title></ci:Title>` +
        `</ci:ComicInfo>`
    );
    assert.equal(info?.series, 'Saga');
    assert.equal(info?.number, null, 'a self-closing element carries no value');
    assert.equal(info?.title, null, 'nor does an empty one');
  });

  it('keeps the fields it has when the rest are missing', () => {
    const info = parseComicInfo('<ComicInfo><Series>Saga</Series></ComicInfo>');
    assert.deepEqual(info, {
      series: 'Saga',
      volumeNumber: null,
      year: null,
      number: null,
      title: null,
    });
  });

  it('is null for a ComicInfo that says nothing usable', () => {
    assert.equal(parseComicInfo('<ComicInfo />'), null);
    assert.equal(parseComicInfo('<ComicInfo><Publisher>Marvel</Publisher></ComicInfo>'), null);
  });

  it('is null for XML that is not a ComicInfo', () => {
    assert.equal(
      parseComicInfo('<?xml version="1.0"?><rss><channel><title>Batman</title></channel></rss>'),
      null
    );
  });

  it('is null for garbage rather than throwing', () => {
    assert.equal(parseComicInfo(''), null);
    assert.equal(parseComicInfo('not xml at all'), null);
    assert.equal(parseComicInfo('\u0000￿<<<>>>&&&;;;'), null);
    assert.equal(parseComicInfo('<ComicInfo><Series>unclosed'), null);
    assert.equal(parseComicInfo(undefined as unknown as string), null);
  });
});

// ---------------------------------------------------------------------------
// applyComicInfo
// ---------------------------------------------------------------------------

const FILENAME_DATA: FilenameData = {
  series: 'Batman',
  year: 2016,
  volumeNumber: 1,
  specialVersion: null,
  issueNumber: 999,
  annual: false,
};

describe('applyComicInfo', () => {
  it('prefers every field the ComicInfo has', () => {
    const merged = applyComicInfo(FILENAME_DATA, {
      series: 'Detective Comics',
      volumeNumber: 3,
      year: 1937,
      number: '27',
      title: null,
    });
    assert.equal(merged.series, 'Detective Comics');
    assert.equal(merged.volumeNumber, 3);
    assert.equal(merged.year, 1937);
    assert.equal(merged.issueNumber, 27);
  });

  it('falls back per field, not wholesale', () => {
    const merged = applyComicInfo(FILENAME_DATA, {
      series: 'Detective Comics',
      volumeNumber: null,
      year: null,
      number: null,
      title: null,
    });
    assert.equal(merged.series, 'Detective Comics');
    assert.equal(merged.issueNumber, 999, 'kept from the filename');
    assert.equal(merged.year, 2016);
    assert.equal(merged.volumeNumber, 1);
  });

  it('converts a Number the way a filename number is converted', () => {
    const range = applyComicInfo(FILENAME_DATA, {
      series: null,
      volumeNumber: null,
      year: null,
      number: '1-6',
      title: null,
    });
    assert.deepEqual(range.issueNumber, [1, 6]);
  });

  it('leaves the filename alone when there is no ComicInfo', () => {
    assert.deepEqual(applyComicInfo(FILENAME_DATA, null), FILENAME_DATA);
  });
});

// ---------------------------------------------------------------------------
// readComicInfo, against real archives
// ---------------------------------------------------------------------------

describe('readComicInfo', () => {
  let root: string;

  before(() => {
    root = join('/tmp', `shelvarr-comicinfo-test-${Date.now()}`);
    mkdirSync(root, { recursive: true });
  });

  after(() => {
    rmSync(root, { recursive: true, force: true });
  });

  function makeCbz(name: string, entries: Record<string, string>): string {
    const encoder = new TextEncoder();
    const zipInput: Record<string, Uint8Array> = { 'page001.jpg': encoder.encode('page-1') };
    for (const [entryName, content] of Object.entries(entries)) {
      zipInput[entryName] = encoder.encode(content);
    }
    const path = join(root, name);
    writeFileSync(path, zipSync(zipInput));
    return path;
  }

  it('reads the ComicInfo.xml out of a CBZ', async () => {
    const path = makeCbz('hulk.cbz', { 'ComicInfo.xml': REALISTIC });
    const info = await readComicInfo(path, '.cbz');
    assert.equal(info?.series, 'Immortal Hulk');
    assert.equal(info?.number, '3');
  });

  it('finds it whatever its case and wherever it is nested', async () => {
    const lower = makeCbz('lower.cbz', { 'comicinfo.xml': REALISTIC });
    assert.equal((await readComicInfo(lower, '.cbz'))?.series, 'Immortal Hulk');

    const nested = makeCbz('nested.cbz', { 'Immortal Hulk 003/ComicInfo.XML': REALISTIC });
    assert.equal((await readComicInfo(nested, '.cbz'))?.series, 'Immortal Hulk');
  });

  it('is null for an archive with no ComicInfo.xml', async () => {
    const path = makeCbz('bare.cbz', {});
    assert.equal(await readComicInfo(path, '.cbz'), null);
  });

  it('is null for a file that is not an archive at all', async () => {
    const path = join(root, 'broken.cbz');
    writeFileSync(path, 'x');
    assert.equal(await readComicInfo(path, '.cbz'), null);
  });

  it('is null for a file that is not there', async () => {
    assert.equal(await readComicInfo(join(root, 'absent.cbz'), '.cbz'), null);
  });

  it('is null for formats we cannot open', async () => {
    const path = makeCbz('seven.cb7', { 'ComicInfo.xml': REALISTIC });
    assert.equal(await readComicInfo(path, '.cb7'), null);
    assert.equal(await readComicInfo(path, '.pdf'), null);
  });
});

// ---------------------------------------------------------------------------
// The scanner, preferring ComicInfo to a misleading filename
// ---------------------------------------------------------------------------

describe('scanning a volume with tagged files', () => {
  let root: string;
  let db: typeof import('../../lib/db/index.js');
  let scan: typeof import('@shelvarr/services/comics/scan');

  before(async () => {
    root = join('/tmp', `shelvarr-comicinfo-scan-test-${Date.now()}`);
    mkdirSync(root, { recursive: true });
    process.env['DATA_DIR'] = root;
    process.env['DB_PATH'] = join(root, 'test.db');

    db = await import('../../lib/db/index.js');
    db.initDatabase();

    const { initServiceConfig } = await import('@shelvarr/services');
    initServiceConfig({
      dataDir: root,
      libraryRoot: root,
      dbPath: join(root, 'test.db'),
      comicPaths: { pathMap: null },
      getcomics: {
        baseUrl: 'https://getcomics.example',
        downloadDir: join(root, 'downloads'),
        hostPreference: ['getcomics'],
        renameDownloadedFiles: true,
      },
      supportedExtensions: ['.cbz'],
    });

    scan = await import('@shelvarr/services/comics/scan');
  });

  after(() => {
    if (db) db.closeDatabase();
    rmSync(root, { recursive: true, force: true });
  });

  beforeEach(() => {
    db.getDb().exec(
      `DELETE FROM comic_issue_files; DELETE FROM comic_files; DELETE FROM comic_issues;
       DELETE FROM comics; DELETE FROM comic_root_folders;`
    );
    rmSync(join(root, 'library'), { recursive: true, force: true });
  });

  function metadata(): ComicVolumeMetadata {
    return {
      comicvineId: 42821,
      title: 'Immortal Hulk',
      year: 2018,
      volumeNumber: 1,
      publisher: 'Marvel',
      description: '',
      coverLink: null,
      siteUrl: null,
      aliases: [],
      issueCount: 5,
      translated: false,
      issues: null,
    };
  }

  function issues(count: number): ComicIssueMetadata[] {
    return Array.from({ length: count }, (_, index) => ({
      comicvineId: 700000 + index,
      volumeComicvineId: 42821,
      issueNumber: String(index + 1),
      calculatedIssueNumber: index + 1,
      title: `Issue ${index + 1}`,
      date: `2018-0${Math.min(9, index + 1)}-01`,
      description: '',
    }));
  }

  function seedVolume(): { volumeId: number; folder: string } {
    const rootPath = join(root, 'library');
    mkdirSync(rootPath, { recursive: true });
    const rootFolder = db.addComicRootFolder(rootPath);

    const folder = join(rootPath, 'Immortal Hulk');
    mkdirSync(folder, { recursive: true });

    const volumeId = db.upsertManagedComicVolume({
      metadata: metadata(),
      rootFolderId: rootFolder.id,
      folder,
    });
    db.replaceComicIssuesFromMetadata(volumeId, issues(5));
    return { volumeId, folder };
  }

  /** A CBZ whose name says one thing and whose ComicInfo.xml says another. */
  function writeTaggedCbz(folder: string, name: string, xml: string): void {
    const encoder = new TextEncoder();
    writeFileSync(
      join(folder, name),
      zipSync({
        'ComicInfo.xml': encoder.encode(xml),
        'page001.jpg': encoder.encode('page-1'),
      })
    );
  }

  it('believes the ComicInfo over the filename', async () => {
    const { volumeId, folder } = seedVolume();
    // The filename claims issue 999, which is not in this volume at all and
    // which the scanner used to report as unmatched.
    writeTaggedCbz(
      folder,
      'Immortal Hulk (2018) Issue 999.cbz',
      '<ComicInfo><Series>Immortal Hulk</Series><Number>3</Number><Volume>2018</Volume></ComicInfo>'
    );

    const result = await scan.scanVolumeFiles(volumeId);
    assert.equal(result.matched, 1);
    assert.deepEqual(result.unmatched, []);

    const issue3 = db
      .getDb()
      .prepare('SELECT id FROM comic_issues WHERE volume_id = ? AND calculated_issue_number = 3')
      .get(volumeId) as { id: number };
    assert.equal(db.getComicFilesForIssue(issue3.id).length, 1);
  });

  it('still parses the filename when the archive carries no ComicInfo', async () => {
    const { volumeId, folder } = seedVolume();
    const encoder = new TextEncoder();
    writeFileSync(
      join(folder, 'Immortal Hulk (2018) Issue 002.cbz'),
      zipSync({ 'page001.jpg': encoder.encode('page-1') })
    );

    const result = await scan.scanVolumeFiles(volumeId);
    assert.equal(result.matched, 1);

    const issue2 = db
      .getDb()
      .prepare('SELECT id FROM comic_issues WHERE volume_id = ? AND calculated_issue_number = 2')
      .get(volumeId) as { id: number };
    assert.equal(db.getComicFilesForIssue(issue2.id).length, 1);
  });
});
