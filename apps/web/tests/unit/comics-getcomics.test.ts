/**
 * GetComics sourcing: article parsing, match filtering, ranking and naming.
 *
 * The fixture in `POST_HTML` is a trimmed copy of a real GetComics article
 * body as returned by the site's WordPress REST API, including its malformed
 * `<p><div>…</div>` nesting — that shape is exactly what the extractor has to
 * cope with, so it is kept verbatim rather than tidied.
 */
import { describe, it, afterEach, mock } from 'node:test';
import assert from 'node:assert';

import {
  extractDownloadGroups,
  identifyHost,
  DEFAULT_HOST_PREFERENCE,
} from '@shelvarr/services/comics/getcomics/groups';
import {
  matchTitle,
  matchYear,
  matchVolumeNumber,
  matchSpecialVersion,
  checkSearchResultMatch,
  downloadGroupFilter,
  type VolumeIssueData,
  type VolumeMatchData,
} from '@shelvarr/services/comics/getcomics/match';
import {
  rankSearchResult,
  compareRanks,
  sortSearchResults,
} from '@shelvarr/services/comics/getcomics/rank';
import { createLinkPaths } from '@shelvarr/services/comics/getcomics/paths';
import { refineSpecialVersion } from '@shelvarr/services/comics/getcomics/parse';
import {
  buildQueries,
  fetchPosts,
  postToSearchResult,
} from '@shelvarr/services/comics/getcomics/search';
import {
  generateIssueName,
  generateVolumeFolderName,
  formatIssueNumber,
} from '@shelvarr/services/comics/naming';
import { filenameFromDisposition, filenameFromUrl } from '@shelvarr/services/comics/getcomics/clients/direct';
import type { ComicSearchResult, DownloadGroup, MatchedComicSearchResult } from '@shelvarr/types';

const POST_HTML = `
<h2>Free DC Comics Download</h2>
<p style="text-align: center;"><strong>Batman &#8211; Superman &#8211; World&#8217;s Finest #54</strong><br />
<strong>Language :</strong> English | <strong>Image Format :</strong> JPG | <strong>Year :</strong> 2026 | <strong>Size :</strong> 45 MB</p>
<p style="text-align: center;"><div class="aio-button-center"><div class="aio-pulse"><a rel="nofollow" href="http://getcomics.org/dls/TOKEN1" class="aio-red" title="DOWNLOAD NOW"><i class="glyphicons"></i>DOWNLOAD NOW</a></div></div>
<p style="text-align: center;"><div class="aio-button-center"><div class="aio-pulse"><a href="https://1024terabox.com/s/abc" class="aio-blue" title="TERABOX"><i class="glyphicons"></i>TERABOX</a></div></div>
<p style="text-align: center;"><div class="aio-button-center"><div class="aio-pulse"><a rel="nofollow" href="http://getcomics.org/dls/TOKEN2" class="aio-orange" title="PIXELDRAIN"><i class="glyphicons"></i>PIXELDRAIN</a></div></div>
<p style="text-align: center;"><div class="aio-button-center"><div class="aio-pulse"><a href="https://readcomicsonline.ru/comic/x/54" class="aio-red" title="READ ONLINE"><i class="glyphicons"></i>READ ONLINE</a></div></div>
<hr />
<p><span><strong>Notes :</strong></span></p>
<ul>
<li>If you have any difficulties, refer to <a href="https://getcomics.info/how-to-download/">this guide</a></li>
</ul>
`;

/** Two releases on one article, separated by an `<hr>`. */
const MULTI_GROUP_HTML = `
<p style="text-align: center;"><strong>Immortal Hulk #1-25</strong><br />
<strong>Language :</strong> English | <strong>Year :</strong> 2018</p>
<p><div class="aio-button-center"><a href="http://getcomics.org/dls/A" title="DOWNLOAD NOW">DOWNLOAD NOW</a></div>
<hr />
<p style="text-align: center;"><strong>Immortal Hulk #26-50</strong><br />
<strong>Language :</strong> English | <strong>Year :</strong> 2020</p>
<p><div class="aio-button-center"><a href="http://getcomics.org/dls/B" title="DOWNLOAD NOW">DOWNLOAD NOW</a></div>
<hr />
`;

describe('identifyHost', () => {
  it('reads the host off the button label, not the URL', () => {
    // GetComics proxies Pixeldrain through its own /dls/ URLs, so the label is
    // the only thing that distinguishes them.
    assert.strictEqual(identifyHost('PIXELDRAIN', 'http://getcomics.org/dls/X'), 'pixeldrain');
    assert.strictEqual(identifyHost('DOWNLOAD NOW', 'http://getcomics.org/dls/X'), 'getcomics');
  });

  it('falls back to the hostname when the label says nothing', () => {
    assert.strictEqual(identifyHost('', 'https://datanodes.to/abc/file.cbz'), 'datanodes');
    assert.strictEqual(identifyHost('Grab it', 'https://pixeldrain.com/u/abc'), 'pixeldrain');
  });

  it('ignores web-reader buttons', () => {
    assert.strictEqual(identifyHost('READ ONLINE', 'https://readcomicsonline.ru/x'), null);
  });

  it('returns null for hosts it has never heard of', () => {
    assert.strictEqual(identifyHost('SOMEHOST', 'https://example.com/file'), null);
  });
});

describe('extractDownloadGroups', () => {
  it('pulls one group with its buttons out of a real article body', () => {
    const groups = extractDownloadGroups(POST_HTML);
    assert.strictEqual(groups.length, 1);

    const group = groups[0]!;
    assert.strictEqual(group.subTitle, "Batman – Superman – World’s Finest #54");
    assert.strictEqual(group.info.series, "Batman Superman World's Finest");
    assert.strictEqual(group.info.issueNumber, 54);
    assert.strictEqual(group.info.year, 2026);
  });

  it('keeps the download hosts and drops the read-online button', () => {
    const { links } = extractDownloadGroups(POST_HTML)[0]!;
    assert.deepStrictEqual(Object.keys(links).sort(), ['getcomics', 'pixeldrain', 'terabox']);
    assert.deepStrictEqual(links.getcomics, ['http://getcomics.org/dls/TOKEN1']);
    assert.deepStrictEqual(links.pixeldrain, ['http://getcomics.org/dls/TOKEN2']);
  });

  it('orders links by host preference', () => {
    const links = extractDownloadGroups(POST_HTML, ['pixeldrain', 'getcomics'])[0]!.links;
    assert.strictEqual(Object.keys(links)[0], 'pixeldrain');

    const reversed = extractDownloadGroups(POST_HTML, DEFAULT_HOST_PREFERENCE)[0]!.links;
    assert.strictEqual(Object.keys(reversed)[0], 'getcomics');
  });

  it('does not let a later section swallow an earlier one', () => {
    const groups = extractDownloadGroups(MULTI_GROUP_HTML);
    assert.strictEqual(groups.length, 2);
    assert.deepStrictEqual(groups[0]!.info.issueNumber, [1, 25]);
    assert.deepStrictEqual(groups[1]!.info.issueNumber, [26, 50]);
    assert.deepStrictEqual(groups[0]!.links.getcomics, ['http://getcomics.org/dls/A']);
    assert.deepStrictEqual(groups[1]!.links.getcomics, ['http://getcomics.org/dls/B']);
  });

  it('returns nothing for an article with no download buttons', () => {
    assert.deepStrictEqual(extractDownloadGroups('<p>Just some prose.</p>'), []);
  });
});

describe('matchTitle', () => {
  it('ignores punctuation, articles and separators', () => {
    assert.ok(matchTitle('The Amazing Spider-Man', 'Amazing Spider Man'));
    assert.ok(matchTitle('Batman: Detective Comics', 'Batman Detective Comics'));
    assert.ok(matchTitle('Hawkeye & Mockingbird', 'Hawkeye and Mockingbird'));
  });

  it('ignores format words but not the brackets around them', () => {
    // Upstream strips "tpb"/"omnibus"/etc. from the words themselves without
    // touching punctuation, so a bracketed suffix leaves "()" behind and the
    // titles no longer compare equal. Kapowarr behaves identically; the
    // download-group filter never sees bracketed titles because
    // extractFilenameData has already stripped them.
    assert.ok(matchTitle('Saga TPB', 'Saga'));
    assert.ok(!matchTitle('Saga', 'Saga (TPB)'));
  });

  it('still rejects genuinely different series', () => {
    assert.ok(!matchTitle('Batman', 'Superman'));
    assert.ok(!matchTitle('Hulk', 'Immortal Hulk'));
  });

  it('supports substring matching when asked', () => {
    assert.ok(matchTitle('Immortal Hulk Director Cut', 'Immortal Hulk', true));
    assert.ok(!matchTitle('Immortal Hulk', 'Immortal Hulk Director Cut', true));
  });
});

describe('matchYear', () => {
  it('allows a year of slack either side', () => {
    assert.ok(matchYear(2020, 2019));
    assert.ok(matchYear(2020, 2021));
    assert.ok(!matchYear(2020, 2022));
  });

  it('uses an end year as the upper bound when given', () => {
    assert.ok(matchYear(2018, 2021, 2020));
    assert.ok(!matchYear(2018, 2023, 2020));
  });

  it('only treats unknown years as a match when conservative', () => {
    assert.ok(!matchYear(null, 2020));
    assert.ok(matchYear(null, 2020, null, true));
  });
});

const VOLUME: VolumeMatchData = {
  title: 'Immortal Hulk',
  altTitle: null,
  year: 2018,
  volumeNumber: 1,
  specialVersion: null,
};

const ISSUES: VolumeIssueData[] = Array.from({ length: 50 }, (_, index) => ({
  id: 1000 + index,
  calculatedIssueNumber: index + 1,
  year: 2018 + Math.floor(index / 20),
  monitored: true,
  hasFile: false,
}));

describe('matchVolumeNumber', () => {
  it('matches the volume number itself', () => {
    assert.ok(matchVolumeNumber(VOLUME, ISSUES, 1));
    assert.ok(!matchVolumeNumber(VOLUME, ISSUES, 3));
  });

  it('accepts a year in the volume-number slot', () => {
    // "Immortal Hulk 2018" — releases often put the year where a volume
    // number would go.
    assert.ok(matchVolumeNumber(VOLUME, ISSUES, 2018));
  });

  it('treats a missing number as a match only when conservative', () => {
    assert.ok(!matchVolumeNumber(VOLUME, ISSUES, null));
    assert.ok(matchVolumeNumber(VOLUME, ISSUES, null, true));
  });

  it('reads volume numbers as issue numbers for volume-as-issue series', () => {
    const vai: VolumeMatchData = { ...VOLUME, specialVersion: 'volume-as-issue' };
    assert.ok(matchVolumeNumber(vai, ISSUES, 7));
    assert.ok(!matchVolumeNumber(vai, ISSUES, 900));
  });
});

describe('matchSpecialVersion', () => {
  it('matches identical versions and metadata/cover files', () => {
    assert.ok(matchSpecialVersion('tpb', 'tpb', 'Saga'));
    assert.ok(matchSpecialVersion('one-shot', 'cover', 'Saga'));
  });

  it('accepts "tpb" as a stand-in for vaguer volume types', () => {
    // Extraction falls back to "tpb" when a filename says nothing specific.
    assert.ok(matchSpecialVersion('hard-cover', 'tpb', 'Saga'));
    assert.ok(matchSpecialVersion('omnibus', 'tpb', 'Saga'));
  });

  it('treats issue 1 of a one-shot as the whole thing', () => {
    assert.ok(matchSpecialVersion('one-shot', null, 'Saga', 1));
  });

  it('rejects a plain issue against a TPB volume', () => {
    assert.ok(!matchSpecialVersion('tpb', null, 'Saga', 4));
  });
});

function searchResult(overrides: Partial<ComicSearchResult> = {}): ComicSearchResult {
  return {
    series: 'Immortal Hulk',
    year: 2018,
    volumeNumber: null,
    specialVersion: null,
    issueNumber: 5,
    annual: false,
    postId: 1,
    link: 'https://getcomics.org/dc/immortal-hulk-5/',
    displayTitle: 'Immortal Hulk #5 (2018)',
    source: 'getcomics',
    ...overrides,
  };
}

describe('checkSearchResultMatch', () => {
  const numberToYear = new Map(ISSUES.map((i) => [i.calculatedIssueNumber, i.year]));
  const context = { volume: VOLUME, issues: ISSUES, numberToYear };

  it('accepts a result for an issue the volume actually has', () => {
    const matched = checkSearchResultMatch(searchResult(), context);
    assert.strictEqual(matched.match, true);
    assert.strictEqual(matched.matchIssue, null);
  });

  it('rejects a different series, and says so', () => {
    const matched = checkSearchResultMatch(searchResult({ series: 'Batman' }), context);
    assert.strictEqual(matched.match, false);
    assert.strictEqual(matched.matchIssue, "Titles don't match");
  });

  it('rejects an issue number the volume does not have', () => {
    const matched = checkSearchResultMatch(searchResult({ issueNumber: 900 }), context);
    assert.strictEqual(matched.match, false);
    assert.strictEqual(matched.matchIssue, "Issue numbers don't match");
  });

  it('rejects an annual when the volume is not one', () => {
    const matched = checkSearchResultMatch(searchResult({ annual: true }), context);
    assert.strictEqual(matched.matchIssue, 'Annual conflict');
  });

  it('rejects a blocklisted link before doing anything else', () => {
    const matched = checkSearchResultMatch(searchResult(), {
      ...context,
      isBlocklisted: () => true,
    });
    assert.strictEqual(matched.matchIssue, 'Link is blocklisted');
  });

  it('demands an exact issue when searching for one issue', () => {
    const exact = checkSearchResultMatch(searchResult({ issueNumber: 5 }), {
      ...context,
      calculatedIssueNumber: 5,
    });
    assert.strictEqual(exact.match, true);

    const wrong = checkSearchResultMatch(searchResult({ issueNumber: 6 }), {
      ...context,
      calculatedIssueNumber: 5,
    });
    assert.strictEqual(wrong.matchIssue, "Issue numbers don't match");
  });

  it('accepts a range that lies wholly inside the volume', () => {
    const matched = checkSearchResultMatch(
      searchResult({ issueNumber: [1, 25] }),
      context
    );
    assert.strictEqual(matched.match, true);
  });
});

describe('downloadGroupFilter', () => {
  it('accepts a group for the right volume', () => {
    const info = searchResult({ issueNumber: [1, 10] });
    assert.ok(downloadGroupFilter(info, VOLUME, 2021, ISSUES));
  });

  it('rejects a group for a different series', () => {
    const info = searchResult({ series: 'Batman' });
    assert.ok(!downloadGroupFilter(info, VOLUME, 2021, ISSUES));
  });
});

function matched(overrides: Partial<MatchedComicSearchResult> = {}): MatchedComicSearchResult {
  return { ...searchResult(), match: true, matchIssue: null, ...overrides };
}

describe('rankSearchResult', () => {
  const context = { title: 'Immortal Hulk', volumeNumber: 1, year: [2018, 2018] as [number, number] };

  it('ranks matches above non-matches', () => {
    const good = rankSearchResult(matched(), context);
    const bad = rankSearchResult(matched({ match: false }), context);
    assert.ok(compareRanks(good, bad) < 0);
  });

  it('penalises series names with extra words in them', () => {
    const tight = rankSearchResult(matched(), context);
    const loose = rankSearchResult(matched({ series: 'Immortal Hulk Director Cut' }), context);
    assert.ok(compareRanks(tight, loose) < 0);
  });

  it('prefers wider ranges when searching for a whole volume', () => {
    const wide = rankSearchResult(matched({ issueNumber: [1, 25] }), context);
    const single = rankSearchResult(matched({ issueNumber: 5 }), context);
    assert.ok(compareRanks(wide, single) < 0);
  });

  it('prefers an exact hit when searching for one issue', () => {
    const issueContext = { ...context, calculatedIssueNumber: 5 };
    const exact = rankSearchResult(matched({ issueNumber: 5 }), issueContext);
    const range = rankSearchResult(matched({ issueNumber: [1, 25] }), issueContext);
    const miss = rankSearchResult(matched({ issueNumber: 40 }), issueContext);
    assert.ok(compareRanks(exact, range) < 0);
    assert.ok(compareRanks(range, miss) < 0);
  });

  it('sorts a result list best-first', () => {
    const results = [
      matched({ match: false, link: 'c' }),
      matched({ issueNumber: 5, link: 'b' }),
      matched({ issueNumber: [1, 25], link: 'a' }),
    ];
    sortSearchResults(results, context);
    assert.deepStrictEqual(results.map((r) => r.link), ['a', 'b', 'c']);
  });
});

describe('createLinkPaths', () => {
  function group(subTitle: string, issueNumber: DownloadGroup['info']['issueNumber']): DownloadGroup {
    return {
      subTitle,
      info: {
        series: 'Immortal Hulk',
        year: 2018,
        volumeNumber: null,
        specialVersion: null,
        issueNumber,
        annual: false,
      },
      links: { getcomics: [`http://getcomics.org/dls/${subTitle}`] },
    };
  }

  it('groups non-overlapping ranges into one path', () => {
    const paths = createLinkPaths({
      groups: [group('a', [1, 25]), group('b', [26, 50])],
      volume: VOLUME,
      issues: ISSUES,
      endingYear: 2021,
    });
    assert.strictEqual(paths.length, 1);
    assert.strictEqual(paths[0]!.length, 2);
  });

  it('splits overlapping ranges into alternative paths', () => {
    const paths = createLinkPaths({
      groups: [group('a', [1, 25]), group('b', [10, 30])],
      volume: VOLUME,
      issues: ISSUES,
      endingYear: 2021,
    });
    assert.strictEqual(paths.length, 2);
    assert.ok(paths.every((path) => path.length === 1));
  });

  it('drops groups that do not match the volume', () => {
    const wrong = group('x', 5);
    wrong.info.series = 'Batman';
    const paths = createLinkPaths({
      groups: [wrong],
      volume: VOLUME,
      issues: ISSUES,
      endingYear: 2021,
    });
    assert.deepStrictEqual(paths, []);
  });

  it('takes everything when forceMatch is set', () => {
    const wrong = group('x', 5);
    wrong.info.series = 'Batman';
    const paths = createLinkPaths({
      groups: [wrong],
      volume: VOLUME,
      issues: ISSUES,
      endingYear: 2021,
      forceMatch: true,
    });
    assert.strictEqual(paths.length, 1);
    assert.strictEqual(paths[0]!.length, 1);
  });
});

describe('buildQueries', () => {
  it('walks from specific to vague', () => {
    const queries = buildQueries(VOLUME, null);
    assert.deepStrictEqual(queries, [
      'Immortal Hulk Vol. 1 (2018)',
      'Immortal Hulk (2018)',
      'Immortal Hulk Vol. 1',
      'Immortal Hulk',
    ]);
  });

  it('includes the issue number when searching for one issue', () => {
    const queries = buildQueries(VOLUME, '5');
    assert.ok(queries[0]!.includes('#5'));
  });

  it('drops the year placeholder when the year is unknown', () => {
    const queries = buildQueries({ ...VOLUME, year: null }, null);
    assert.ok(queries.every((query) => !query.includes('()') && !query.includes('null')));
  });

  it('uses the TPB ladder for TPB volumes', () => {
    const queries = buildQueries({ ...VOLUME, specialVersion: 'tpb' }, null);
    assert.ok(queries[0]!.endsWith('TPB'));
  });
});

describe('fetchPosts', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  function wpResponse(body: unknown, headers: Record<string, string> = {}) {
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'Content-Type': 'application/json', ...headers },
    });
  }

  it('maps WordPress posts and decodes their titles', async () => {
    global.fetch = mock.fn(async () =>
      wpResponse(
        [
          {
            id: 7,
            link: 'https://getcomics.org/dc/x/',
            date: '2026-08-19T11:21:15',
            title: { rendered: 'Batman &#8211; Robin #1' },
            content: { rendered: '<p>body</p>' },
          },
        ],
        { 'X-WP-TotalPages': '1' }
      )
    ) as typeof fetch;

    const posts = await fetchPosts('batman');
    assert.strictEqual(posts.length, 1);
    // Entities are decoded but typography is left alone — the raw title is
    // what gets shown in the UI. Normalisation happens during extraction.
    assert.strictEqual(posts[0]!.title, 'Batman \u2013 Robin #1');
    assert.strictEqual(posts[0]!.contentHtml, '<p>body</p>');
  });

  it('stops once WordPress says there are no more pages', async () => {
    const fetchMock = mock.fn(async () =>
      wpResponse([{ id: 1, link: 'a', date: 'd', title: { rendered: 't' }, content: { rendered: '' } }], {
        'X-WP-TotalPages': '1',
      })
    );
    global.fetch = fetchMock as typeof fetch;

    await fetchPosts('batman', { maxPages: 5 });
    assert.strictEqual(fetchMock.mock.callCount(), 1);
  });

  it('treats the past-the-end 400 as the end of results', async () => {
    global.fetch = mock.fn(async () => new Response('{}', { status: 400 })) as typeof fetch;
    assert.deepStrictEqual(await fetchPosts('nothing'), []);
  });

  it('sends the query and field list the API expects', async () => {
    let requested = '';
    global.fetch = mock.fn(async (url: string) => {
      requested = url;
      return wpResponse([], { 'X-WP-TotalPages': '1' });
    }) as unknown as typeof fetch;

    await fetchPosts('immortal hulk', { baseUrl: 'https://example.test/' });
    assert.ok(requested.startsWith('https://example.test/wp-json/wp/v2/posts?'));
    assert.ok(requested.includes('search=immortal%20hulk'));
    assert.ok(requested.includes('_fields=id,title,link,date,content'));
  });
});

describe('postToSearchResult', () => {
  it('parses the post title into match data', () => {
    const result = postToSearchResult({
      id: 3,
      title: 'Immortal Hulk 001-050 (2018-2021)',
      link: 'https://getcomics.org/dc/immortal-hulk/',
      date: '2026-01-01T00:00:00',
      contentHtml: '',
    });
    assert.deepStrictEqual(result.issueNumber, [1, 50]);
    assert.strictEqual(result.series, 'Immortal Hulk');
    assert.strictEqual(result.source, 'getcomics');
  });
});

describe('naming', () => {
  const volume = {
    title: 'Immortal Hulk',
    year: 2018,
    volumeNumber: 1,
    specialVersion: null,
    publisher: 'Marvel',
  };

  it('pads issue numbers and renders ranges', () => {
    assert.strictEqual(formatIssueNumber(5), '005');
    assert.strictEqual(formatIssueNumber([1, 25]), '001-025');
    assert.strictEqual(formatIssueNumber(3.5), '003.5');
    assert.strictEqual(formatIssueNumber(null), '');
  });

  it('names an issue file', () => {
    assert.strictEqual(
      generateIssueName(volume, 5),
      'Immortal Hulk (2018) Volume 01 Issue 005'
    );
  });

  it('uses the special-version template for a TPB', () => {
    assert.strictEqual(
      generateIssueName({ ...volume, specialVersion: 'tpb' }, null),
      'Immortal Hulk (2018) Volume 01 TPB'
    );
  });

  it('collapses the empty year when it is unknown', () => {
    const name = generateIssueName({ ...volume, year: null }, 5);
    assert.strictEqual(name, 'Immortal Hulk Volume 01 Issue 005');
  });

  it('builds a volume folder path', () => {
    assert.strictEqual(generateVolumeFolderName(volume), 'Immortal Hulk/Volume 01 (2018)');
  });
});

describe('filename extraction from HTTP responses', () => {
  it('reads a quoted Content-Disposition filename', () => {
    assert.strictEqual(
      filenameFromDisposition('attachment; filename="Immortal Hulk 005.cbz"'),
      'Immortal Hulk 005.cbz'
    );
  });

  it('prefers the RFC 5987 encoded form', () => {
    assert.strictEqual(
      filenameFromDisposition("attachment; filename*=UTF-8''Hulk%20005.cbz"),
      'Hulk 005.cbz'
    );
  });

  it('returns null when there is no header', () => {
    assert.strictEqual(filenameFromDisposition(null), null);
  });

  it('falls back to the URL path', () => {
    assert.strictEqual(
      filenameFromUrl('https://fs3.comicfiles.ru/2026.08.19/Hulk%20005.cbz?x=1'),
      'Hulk 005.cbz'
    );
  });
});

describe('refineSpecialVersion', () => {
  const info = {
    series: 'Berserk',
    year: 2003,
    volumeNumber: 2 as number | [number, number] | null,
    specialVersion: 'tpb' as
      | 'tpb'
      | 'omnibus'
      | 'one-shot'
      | 'hard-cover'
      | 'volume-as-issue'
      | 'cover'
      | 'metadata'
      | null,
    issueNumber: null as number | [number, number] | null,
    annual: false,
  };

  it('moves the volume number into the issue slot for volume-as-issue series', () => {
    const refined = refineSpecialVersion(
      { specialVersion: 'volume-as-issue', volumeNumber: 1 },
      info
    );
    assert.strictEqual(refined.issueNumber, 2);
    assert.strictEqual(refined.volumeNumber, 1);
    assert.strictEqual(refined.specialVersion, null);
  });

  it('handles a volume range as an issue range', () => {
    const refined = refineSpecialVersion(
      { specialVersion: 'volume-as-issue', volumeNumber: 1 },
      { ...info, specialVersion: 'one-shot', volumeNumber: [2, 3] }
    );
    assert.deepStrictEqual(refined.issueNumber, [2, 3]);
    assert.strictEqual(refined.specialVersion, null);
  });

  it('upgrades a vague TPB to what the volume actually is', () => {
    const refined = refineSpecialVersion({ specialVersion: 'omnibus', volumeNumber: 1 }, info);
    assert.strictEqual(refined.specialVersion, 'omnibus');
  });

  it('leaves a normal volume alone', () => {
    const refined = refineSpecialVersion({ specialVersion: null, volumeNumber: 1 }, info);
    assert.deepStrictEqual(refined, info);
  });
});
