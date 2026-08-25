/**
 * Filename/title extraction parity tests.
 *
 * The `KAPOWARR_CORPUS` cases below are lifted verbatim from Kapowarr's own
 * suite (`tests/Tbackend/file_extraction.py`, v1.3.1) — they are the hard
 * cases the upstream regexes were tuned against, and our port is expected to
 * agree with all of them. Both projects are GPL-3.0; see NOTICE.md.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert';

import {
  extractFilenameData,
  extractIssueNumber,
  extractVolumeNumber,
  calculatedIssueNumber,
  type ExtractOptions,
} from '@shelvarr/services/comics/getcomics/parse';
import type { FilenameData } from '@shelvarr/types';

type Expected = Omit<FilenameData, 'issueNumber' | 'volumeNumber'> & {
  issueNumber: number | number[] | null;
  volumeNumber: number | number[] | null;
};

const KAPOWARR_CORPUS: Array<[string, ExtractOptions, Expected]> = [
  ["Iron-Man Volume 2 Issue 3.cbr", {}, {"series": "Iron Man", "year": null, "volumeNumber": 2, "specialVersion": null, "issueNumber": 3.0, "annual": false}],
  ["/Comics/Batman/Volume 1 (1940)/Batman (1940) Volume 2 Issue 11-25.zip", {}, {"series": "Batman", "year": 1940, "volumeNumber": 2, "specialVersion": null, "issueNumber": [11.0, 25.0], "annual": false}],
  ["Tales of the Unexpected, 2006-12-00 (#03) (digital) (Glorith-Novus).cbz", {}, {"series": "Tales of the Unexpected", "year": 2006, "volumeNumber": 1, "specialVersion": null, "issueNumber": 3.0, "annual": false}],
  ["Tales of the Teen Titans v2 (1984)/Issue 51-58 - Tales of the Teen Titans (1985-03-01)", {}, {"series": "Tales of the Teen Titans", "year": 1985, "volumeNumber": 2, "specialVersion": null, "issueNumber": [51.0, 58.0], "annual": false}],
  ["Doctor Strange, Sorcerer Supreme Volume 2 Issues #4.0-4.5 (03-2022)", {}, {"series": "Doctor Strange, Sorcerer Supreme", "year": 2022, "volumeNumber": 2, "specialVersion": null, "issueNumber": [4.0, 4.5], "annual": false}],
  ["The Incredible Hulk/Volume III/5-6 - The Incredible Hulk (2022).epub", {}, {"series": "The Incredible Hulk", "year": 2022, "volumeNumber": 3, "specialVersion": null, "issueNumber": [5.0, 6.0], "annual": false}],
  ["John Constantine, Hellblazer: 30th Anniversary Celebration (2018)/John Constantine, Hellblazer: 30th Anniversary Celebration (2018) - 5.zip", {}, {"series": "John Constantine, Hellblazer: 30th Anniversary Celebration", "year": 2018, "volumeNumber": 1, "specialVersion": null, "issueNumber": 5.0, "annual": false}],
  ["Team 7 v1 (2012)/Team 7 (0-8) GetComics.INFO/Team 7 008.cbr", {}, {"series": "Team 7", "year": 2012, "volumeNumber": 1, "specialVersion": null, "issueNumber": 8.0, "annual": false}],
  ["Infinity Gauntlet #1 – 6 (1991-1992)", {}, {"series": "Infinity Gauntlet", "year": 1991, "volumeNumber": 1, "specialVersion": null, "issueNumber": [1.0, 6.0], "annual": false}],
  ["1. Infinity Gauntlet #2 - 100 (1999-2009)", {}, {"series": "Infinity Gauntlet", "year": 1999, "volumeNumber": 1, "specialVersion": null, "issueNumber": [2.0, 100.0], "annual": false}],
  ["100 Bullets #1 - 101 (1999-2009)", {}, {"series": "100 Bullets", "year": 1999, "volumeNumber": 1, "specialVersion": null, "issueNumber": [1.0, 101.0], "annual": false}],
  ["Batman 026-050 (1945-1949) GetComics.INFO/Batman 048 52p ctc (08-1948) flattermann.cbr", {}, {"series": "Batman", "year": 1948, "volumeNumber": 1, "specialVersion": null, "issueNumber": 48.0, "annual": false}],
  ["01. X-Men Vol. 2 (#05, #1 – 113 + Annuals) Part 1 — #1 – 25 --2022-2023--", {}, {"series": "X Men", "year": 2022, "volumeNumber": 2, "specialVersion": null, "issueNumber": [1.0, 25.0], "annual": false}],
  ["Batman ’66 Meets the Man From U.N.C.L.E. (2016)", {}, {"series": "Batman '66 Meets the Man From U.N.C.L.E.", "year": 2016, "volumeNumber": 1, "specialVersion": "tpb", "issueNumber": null, "annual": false}],
  ["Thor Vol. 3 #1 – 12 (Also known 588-599) + #600 – 621 (2007-2011) --2007-2011--", {}, {"series": "Thor", "year": 2007, "volumeNumber": 3, "specialVersion": null, "issueNumber": [600.0, 621.0], "annual": false}],
  ["Aliens Life And Death #003 (2016) Volume 02.cbr", {}, {"series": "Aliens Life And Death", "year": 2016, "volumeNumber": 2, "specialVersion": null, "issueNumber": 3.0, "annual": false}],
  ["/Comics/Invincible Compendium/Volume 1/Invincible Compendium Volume 2 Issue 3 - Volume 4 (2018-07-18).cbr", {}, {"series": "Invincible Compendium", "year": 2018, "volumeNumber": 2, "specialVersion": null, "issueNumber": 3.0, "annual": false}],
  ["Batman and the Mad Monk (1-6) (2006-2007) GetComics.INFO/Batman___The_Mad_Monk_02__2007___team-ocdcp_.cbr", {}, {"series": "Batman The Mad Monk", "year": 2007, "volumeNumber": 1, "specialVersion": null, "issueNumber": 2.0, "annual": false}],
  ["/comics-1/Heroes for Hire/Heroes for Hire # ½ 02-2005.cbr", {}, {"series": "Heroes for Hire", "year": 2005, "volumeNumber": 1, "specialVersion": null, "issueNumber": 0.5, "annual": false}],
  ["Spider-Man (2005) #3 - The Vector Attacks! - [01-02-2006] [cv-123]", {}, {"series": "Spider Man", "year": 2005, "volumeNumber": 1, "specialVersion": null, "issueNumber": 3.0, "annual": false}],
  ["Captain America (2018) Issue 025 - All Die Young Part VI; The Promise", {}, {"series": "Captain America", "year": 2018, "volumeNumber": 1, "specialVersion": null, "issueNumber": 25.0, "annual": false}],
  ["Wolverine (2020) Issue 006 - X of Swords, Chapter 3", {}, {"series": "Wolverine", "year": 2020, "volumeNumber": 1, "specialVersion": null, "issueNumber": 6.0, "annual": false}],
  ["Batman Annual (1961) Volume 1 Issue 10/90 - Batman_Annual #10/Batman Annual #10-02.jpg", {}, {"series": "Batman Annual", "year": 1961, "volumeNumber": 1, "specialVersion": null, "issueNumber": 10.0, "annual": true}],
  ["Action Comics (2011) #31 - Infected Chapter 1 True Believers", {}, {"series": "Action Comics", "year": 2011, "volumeNumber": 1, "specialVersion": null, "issueNumber": 31.0, "annual": false}],
  ["The Wicked + The Divine (2014) - 035 1-2-3-4! ; The Curse in My Hands - [2018-04-30]", {}, {"series": "The Wicked The Divine", "year": 2014, "volumeNumber": 1, "specialVersion": null, "issueNumber": 35.0, "annual": false}],
  ["Avengers Classic #1 – 12 (2007-2008)", {}, {"series": "Avengers Classic", "year": 2007, "volumeNumber": 1, "specialVersion": null, "issueNumber": [1.0, 12.0], "annual": false}],
  ["Spider-Man Chapter One 002(1999).cbr", {}, {"series": "Spider Man Chapter One", "year": 1999, "volumeNumber": 1, "specialVersion": null, "issueNumber": 2.0, "annual": false}],
  ["Spider-Man Chapter One 002-004(1999).cbr", {}, {"series": "Spider Man Chapter One", "year": 1999, "volumeNumber": 1, "specialVersion": null, "issueNumber": [2.0, 4.0], "annual": false}],
  ["The Sandman Book 1 – 6 (2022-2023)", {}, {"series": "The Sandman", "year": 2022, "volumeNumber": 1, "specialVersion": null, "issueNumber": [1.0, 6.0], "annual": false}],
  ["Here --2014 + 1989--", {}, {"series": "Here", "year": 2014, "volumeNumber": 1, "specialVersion": "tpb", "issueNumber": null, "annual": false}],
  ["Batgirls - #007 - One Way or Another, Part 1 of 2 (2022-02-01) [898184]", {}, {"series": "Batgirls", "year": 2022, "volumeNumber": 1, "specialVersion": null, "issueNumber": 7.0, "annual": false}],
  ["The Amazing Spider-Man (2022) Volume 06 Issue 065.Deaths.cbz", {}, {"series": "The Amazing Spider Man", "year": 2022, "volumeNumber": 6, "specialVersion": null, "issueNumber": 65.040501200819, "annual": false}],
  ["/Comics/Venom (2021) [cv-140084]/Venom (2021) #0021 [Pages 2-19 They Fight] [2023-08-01] [cv-996034].cbz", {}, {"series": "Venom", "year": 2021, "volumeNumber": 1, "specialVersion": null, "issueNumber": 21.0, "annual": false}],
  ["Spider-Man/Spider-Man Volume 2 (2005)/Spider-Man (2005) Volume 2 title (No. 5).cbr", {}, {"series": "Spider Man", "year": 2005, "volumeNumber": 2, "specialVersion": null, "issueNumber": 5.0, "annual": false}],
  ["Spider-Man/Spider-Man Volume 2 (2005)/5 - Spider-Man (2005) Volume 2 title.cbr", {}, {"series": "Spider Man", "year": 2005, "volumeNumber": 2, "specialVersion": null, "issueNumber": 5.0, "annual": false}],
  ["IDW Publishing/30 Days of Night/30 Days of Night (2002)/30 Days of Night (2002) 004.cbz", {}, {"series": "30 Days of Night", "year": 2002, "volumeNumber": 1, "specialVersion": null, "issueNumber": 4.0, "annual": false}],
  ["X-Factor v1 -001 (1997)", {}, {"series": "X Factor", "year": 1997, "volumeNumber": 1, "specialVersion": null, "issueNumber": -1.0, "annual": false}],
  ["A+X 002 (2013) 03 of 04 covers.cbz", {}, {"series": "A X", "year": 2013, "volumeNumber": 1, "specialVersion": null, "issueNumber": 2.0, "annual": false}],
  ["DC vs Vampires World War V 003 (2024)", {}, {"series": "DC vs Vampires World War V", "year": 2024, "volumeNumber": 1, "specialVersion": null, "issueNumber": 3.0, "annual": false}],
  ["DC vs. Vampires World War V Issue 002 (2024)", {}, {"series": "DC vs. Vampires World War V", "year": 2024, "volumeNumber": 1, "specialVersion": null, "issueNumber": 2.0, "annual": false}],
  ["/Blacksad/Blacksad 6.1 - They All Fall Down Part 1.cbz", {}, {"series": "Blacksad", "year": null, "volumeNumber": 1, "specialVersion": null, "issueNumber": 6.1, "annual": false}],
  ["Absolute Moebius 07 - Il fallico folle (2012) [c2c Lux73 pipulus] 2.0.cbr", {}, {"series": "Absolute Moebius", "year": 2012, "volumeNumber": 1, "specialVersion": null, "issueNumber": 7.0, "annual": false}],
  ["L'Uomo Ragno 219 - Il demone devastatore (Corno 1978-09-18) [c2c Jedi-Italia] 1.0.cbr", {}, {"series": "L'Uomo Ragno", "year": 1978, "volumeNumber": 1, "specialVersion": null, "issueNumber": 219.0, "annual": false}],
  ["52 Томa 3 Issue 3-5 (2022)", {}, {"series": "52", "year": 2022, "volumeNumber": 3, "specialVersion": null, "issueNumber": [3.0, 5.0], "annual": false}],
  ["Team 6 7Том", {}, {"series": "Team 6", "year": null, "volumeNumber": 7, "specialVersion": "tpb", "issueNumber": null, "annual": false}],
  ["Kid Colt 第5卷 01-02-2022 c8", {}, {"series": "Kid Colt", "year": 2022, "volumeNumber": 5, "specialVersion": null, "issueNumber": 8.0, "annual": false}],
  ["Batman & Robin 2권 Issues#5-8a + Annuals (2000-2005).cbr", {}, {"series": "Batman & Robin", "year": 2000, "volumeNumber": 2, "specialVersion": null, "issueNumber": [5.0, 8.01], "annual": false}],
  ["Iron-Man (1993) T3", {}, {"series": "Iron Man", "year": 1993, "volumeNumber": 1, "specialVersion": null, "issueNumber": 3.0, "annual": false}],
  ["Iron-Man (1993) Tome 4", {}, {"series": "Iron Man", "year": 1993, "volumeNumber": 1, "specialVersion": null, "issueNumber": 4.0, "annual": false}],
  ["Avengers (1996) Volume 2 Annuals.zip", {}, {"series": "Avengers", "year": 1996, "volumeNumber": 2, "specialVersion": "tpb", "issueNumber": null, "annual": true}],
  ["Avengers (1996) Volume 3 + Annuals.zip", {}, {"series": "Avengers", "year": 1996, "volumeNumber": 3, "specialVersion": "tpb", "issueNumber": null, "annual": false}],
  ["Avengers (1996) Volume 4 Annuals + Issue 5.zip", {}, {"series": "Avengers", "year": 1996, "volumeNumber": 4, "specialVersion": null, "issueNumber": 5.0, "annual": false}],
  ["Avengers Annuals (1996) v3/c6.cbr", {}, {"series": "Avengers Annuals", "year": 1996, "volumeNumber": 3, "specialVersion": null, "issueNumber": 6.0, "annual": true}],
  ["Avengers + Annuals (1996) v3/c #6-7 ½ + annual.cbr", {}, {"series": "Avengers Annuals", "year": 1996, "volumeNumber": 3, "specialVersion": null, "issueNumber": [6.0, 7.5], "annual": false}],
  ["Batman Vol. 2 #0 - 48 + Annual #1 - 4", {}, {"series": "Batman", "year": null, "volumeNumber": 2, "specialVersion": null, "issueNumber": [0.0, 48.0], "annual": false}],
  ["Silver Surfer - Rebirth (2022) (HD-WebRip) Volume 2/Silver Surfer - Rebirth (2022) (HD-WebRip) - 011.jpg", {}, {"series": "Silver Surfer Rebirth", "year": 2022, "volumeNumber": 2, "specialVersion": "tpb", "issueNumber": null, "annual": false}],
  ["Silver Surfer - Rebirth (2022) (HD-WebRip) Volume 2/Silver Surfer - Rebirth (2022) (HD-WebRip) - 011.cbr", {}, {"series": "Silver Surfer Rebirth", "year": 2022, "volumeNumber": 2, "specialVersion": null, "issueNumber": 11.0, "annual": false}],
  ["Silver Surfer - Rebirth (2022) (HD-WebRip) Volume 2/Page-100.jpg", {}, {"series": "Silver Surfer Rebirth", "year": 2022, "volumeNumber": 2, "specialVersion": "tpb", "issueNumber": null, "annual": false}],
  ["Silver Surfer - Rebirth (2022) (HD-WebRip) Volume 2/Page - 100.jpg", {}, {"series": "Silver Surfer Rebirth", "year": 2022, "volumeNumber": 2, "specialVersion": "tpb", "issueNumber": null, "annual": false}],
  ["Silver Surfer - Rebirth (2022) (HD-WebRip) Volume 2/100.jpg", {}, {"series": "Silver Surfer Rebirth", "year": 2022, "volumeNumber": 2, "specialVersion": "tpb", "issueNumber": null, "annual": false}],
  ["Star Wars Darth Vader (2020) Volume 3 Issue 18/Star Wars - Darth Vader (2021-) 019-002.jpg", {}, {"series": "Star Wars Darth Vader", "year": 2021, "volumeNumber": 3, "specialVersion": null, "issueNumber": 18.0, "annual": false}],
  ["Reign of X (2021) Volume 2/Reign Of X v02 (2021) (Digital-Empire)/Reign Of X v02-003.jpg", {}, {"series": "Reign Of X", "year": 2021, "volumeNumber": 2, "specialVersion": "tpb", "issueNumber": null, "annual": false}],
  ["Batman Annual (1961) Volume 1 Issue 1-28/Batman - Annuals (1-28) (1961-2011) GetComics.INFO/Batman Annual 006 (1964) (no cover).cbr", {}, {"series": "Batman Annual", "year": 1964, "volumeNumber": 1, "specialVersion": null, "issueNumber": 6.0, "annual": true}],
  ["Batman_Annual_n02c01", {}, {"series": "Batman Annual", "year": null, "volumeNumber": 1, "specialVersion": "cover", "issueNumber": 2.0, "annual": true}],
  ["Batman Annual (1961) Volume 1 Issue 1-28/Batman - Annuals (1-28) (1961-2011) GetComics.INFO/Batman Annual cover (1964).cbr", {}, {"series": "Batman Annual", "year": 1964, "volumeNumber": 1, "specialVersion": "cover", "issueNumber": null, "annual": true}],
  ["Batman Annual (1961) Volume 1 Issue 1-28/Batman - Annuals (1-28) (1961-2011) GetComics.INFO/Batman Annual v2c6 (1964).cbr", {}, {"series": "Batman Annual", "year": 1964, "volumeNumber": 2, "specialVersion": null, "issueNumber": 6.0, "annual": true}],
  ["Batman Annual (1961) Volume 1 Issue 16/Batman-Annual-1992-16-00-FC.jpg", {}, {"series": "Batman Annual", "year": 1992, "volumeNumber": 1, "specialVersion": "cover", "issueNumber": 16.0, "annual": true}],
  ["Batman Annual (1961) Volume 1 Issue 13/Batman-Annual #13-00fc.jpg", {}, {"series": "Batman Annual", "year": 1961, "volumeNumber": 1, "specialVersion": "cover", "issueNumber": 13.0, "annual": true}],
  ["Batman Annual (1961) Volume 1 Issue 14/Batman-Annual #14-00.jpg", {}, {"series": "Batman Annual", "year": 1961, "volumeNumber": 1, "specialVersion": null, "issueNumber": 14.0, "annual": true}],
  ["Action Comics/Volume 2 (2011)/Action Comics 000 (2012) (4 covers) (digital) (Minutemen-PhD).cbr", {}, {"series": "Action Comics", "year": 2012, "volumeNumber": 2, "specialVersion": null, "issueNumber": 0.0, "annual": false}],
  ["Undiscovered Country Volume 2 Issue 3.cbr", {}, {"series": "Undiscovered Country", "year": null, "volumeNumber": 2, "specialVersion": null, "issueNumber": 3.0, "annual": false}],
  ["Undiscovered Country Volume 2 Issue 3/Undiscovered Country Volume 2 Issue 3 Cover.jpg", {}, {"series": "Undiscovered Country", "year": null, "volumeNumber": 2, "specialVersion": "cover", "issueNumber": 3.0, "annual": false}],
  ["Iron-Man (1980) Volume 2 One-Shot Cover", {}, {"series": "Iron Man", "year": 1980, "volumeNumber": 2, "specialVersion": "cover", "issueNumber": null, "annual": false}],
  ["Iron-Man (1980) Volume 2/folder.jpg", {}, {"series": "Iron Man", "year": 1980, "volumeNumber": 2, "specialVersion": "cover", "issueNumber": null, "annual": false}],
  ["Iron Man/Volume 1 (1945)/Iron Man Volume 1 Issue 100 (02-03-1950).cbr", { preferFolderYear: true }, {"series": "Iron Man", "year": 1945, "volumeNumber": 1, "specialVersion": null, "issueNumber": 100.0, "annual": false}],
  ["Iron Man/Volume 1/Iron Man Volume 1 Issue 100 (02-03-1950).cbr", { preferFolderYear: true }, {"series": "Iron Man", "year": 1950, "volumeNumber": 1, "specialVersion": null, "issueNumber": 100.0, "annual": false}],
  ["Superman Lost Volume 2 Issue 3.cbr", {}, {"series": "Superman Lost", "year": null, "volumeNumber": 2, "specialVersion": null, "issueNumber": 3.0, "annual": false}],
  ["Superman Lost Volume 2.cbr", {}, {"series": "Superman Lost", "year": null, "volumeNumber": 2, "specialVersion": "tpb", "issueNumber": null, "annual": false}],
  ["Superman Lost Volume 2 Issue 3 TPB.cbr", {}, {"series": "Superman Lost", "year": null, "volumeNumber": 2, "specialVersion": "tpb", "issueNumber": null, "annual": false}],
  ["Superman Lost Volume 2 Trade paper BACK.cbr", {}, {"series": "Superman Lost", "year": null, "volumeNumber": 2, "specialVersion": "tpb", "issueNumber": null, "annual": false}],
  ["Superman Lost Volume 2 OS.cbr", {}, {"series": "Superman Lost", "year": null, "volumeNumber": 2, "specialVersion": "one-shot", "issueNumber": null, "annual": false}],
  ["Superman Lost Volume 2 (OS).cbr", {}, {"series": "Superman Lost", "year": null, "volumeNumber": 2, "specialVersion": "one-shot", "issueNumber": null, "annual": false}],
  ["Superman Lost Volume 2 [OS].cbr", {}, {"series": "Superman Lost", "year": null, "volumeNumber": 2, "specialVersion": "one-shot", "issueNumber": null, "annual": false}],
  ["Superman Lost Volume 2 One Shot.cbr", {}, {"series": "Superman Lost", "year": null, "volumeNumber": 2, "specialVersion": "one-shot", "issueNumber": null, "annual": false}],
  ["Superman Lost Volume 2 ONE-SHOT.cbr", {}, {"series": "Superman Lost", "year": null, "volumeNumber": 2, "specialVersion": "one-shot", "issueNumber": null, "annual": false}],
  ["Superman Lost Volume 2 Hc.cbr", {}, {"series": "Superman Lost", "year": null, "volumeNumber": 2, "specialVersion": "hard-cover", "issueNumber": null, "annual": false}],
  ["Superman Lost Volume 2 Hard Cover.cbr", {}, {"series": "Superman Lost", "year": null, "volumeNumber": 2, "specialVersion": "hard-cover", "issueNumber": null, "annual": false}],
  ["Superman Lost Volume 2 Issue 3 HARD-COVER.cbr", {}, {"series": "Superman Lost", "year": null, "volumeNumber": 2, "specialVersion": "hard-cover", "issueNumber": null, "annual": false}],
  ["Iron Man Vol. 2 #1 – 13 + TPB (1996-1997 + 2006)", {}, {"series": "Iron Man", "year": 1996, "volumeNumber": 2, "specialVersion": null, "issueNumber": [1.0, 13.0], "annual": false}],
  ["Iron Man/Vol. 2 (2012)/series.json", {}, {"series": "Iron Man", "year": 2012, "volumeNumber": 2, "specialVersion": "metadata", "issueNumber": null, "annual": false}],
  ["Iron Man/Volume 2 (2012)/Issue 5/comicinfo.xml", {}, {"series": "Iron Man", "year": 2012, "volumeNumber": 2, "specialVersion": "metadata", "issueNumber": 5.0, "annual": false}],];

describe('extractFilenameData', () => {
  it('matches Kapowarr on its full extraction corpus', () => {
    const failures: string[] = [];

    for (const [input, options, expected] of KAPOWARR_CORPUS) {
      const got = extractFilenameData(input, options);
      const actual = {
        series: got.series,
        year: got.year,
        volumeNumber: got.volumeNumber,
        specialVersion: got.specialVersion,
        issueNumber: got.issueNumber,
        annual: got.annual,
      };
      if (JSON.stringify(actual) !== JSON.stringify(expected)) {
        failures.push(
          `${JSON.stringify(input)}\n  expected ${JSON.stringify(expected)}\n  actual   ${JSON.stringify(actual)}`
        );
      }
    }

    assert.deepStrictEqual(
      failures,
      [],
      `${failures.length}/${KAPOWARR_CORPUS.length} corpus cases diverge:\n${failures.join('\n')}`
    );
  });

  it('parses a plain GetComics post title', () => {
    assert.deepStrictEqual(
      extractFilenameData("Batman - Superman - World's Finest #54 (2026)", {
        assumeVolumeNumber: false,
        fixYear: true,
      }),
      {
        series: "Batman Superman World's Finest",
        year: 2026,
        volumeNumber: null,
        specialVersion: null,
        issueNumber: 54,
        annual: false,
      }
    );
  });

  it('reads an issue range out of a post title', () => {
    const data = extractFilenameData('Immortal Hulk 001-050 (2018-2021)');
    assert.deepStrictEqual(data.issueNumber, [1, 50]);
    assert.strictEqual(data.series, 'Immortal Hulk');
  });

  it('treats a volume with no issue number as a TPB', () => {
    const data = extractFilenameData('Saga Vol. 1 (2012)');
    assert.strictEqual(data.specialVersion, 'tpb');
    assert.strictEqual(data.volumeNumber, 1);
  });

  it('keeps ½ attached to the issue number it belongs to', () => {
    // JS's \b is not Unicode-aware the way Python's is; without the explicit
    // boundary this truncates to [6, 7].
    const data = extractFilenameData('Avengers + Annuals (1996) v3/c #6-7 ½ + annual.cbr');
    assert.deepStrictEqual(data.issueNumber, [6, 7.5]);
  });
});

describe('issue number conversion', () => {
  it('converts plain, fractional and suffixed numbers', () => {
    assert.strictEqual(calculatedIssueNumber('3.5'), 3.5);
    assert.strictEqual(calculatedIssueNumber('3 ½'), 3.5);
    assert.strictEqual(calculatedIssueNumber('-10a'), -10.01);
    assert.strictEqual(calculatedIssueNumber('2b'), 2.02);
  });

  it('returns null for values with no number in them', () => {
    assert.strictEqual(calculatedIssueNumber(''), null);
    assert.strictEqual(calculatedIssueNumber('-'), null);
  });

  it('converts ranges', () => {
    assert.deepStrictEqual(extractIssueNumber('2½ - 4.5'), [2.5, 4.5]);
    assert.deepStrictEqual(extractIssueNumber('1-25'), [1, 25]);
    assert.strictEqual(extractIssueNumber('7'), 7);
  });

  it('understands roman volume numerals', () => {
    assert.strictEqual(extractVolumeNumber('IV'), 4);
    assert.strictEqual(extractVolumeNumber('2'), 2);
    assert.deepStrictEqual(extractVolumeNumber('2-4'), [2, 4]);
    assert.strictEqual(extractVolumeNumber(null), null);
  });
});
