/**
 * Rank search results so the best candidate ends up first.
 *
 * Derived from Kapowarr (GPL-3.0) `backend/features/search.py`
 * (`_rank_search_result`) — see NOTICE.md.
 */

import type { MatchedComicSearchResult } from '@shelvarr/types';

export interface RankContext {
  /** The (normalised) title we searched for. */
  title: string;
  volumeNumber: number | null;
  /** `[volume year, issue year]` — either may be unknown. */
  year: [number | null, number | null];
  /** Set when the search was for a single issue. */
  calculatedIssueNumber?: number | null;
}

/**
 * Produce a sort key for a search result. Lower is better, compared
 * element-by-element.
 */
export function rankSearchResult(
  result: MatchedComicSearchResult,
  context: RankContext
): number[] {
  const { title, volumeNumber, year, calculatedIssueNumber = null } = context;
  const rating: number[] = [];

  // Actual matches always outrank non-matches.
  rating.push(result.match ? 0 : 1);

  // Then: the fewer words in the result's series that we didn't search for,
  // the better.
  const searchWords = new Set(title.split(' '));
  rating.push(result.series.split(' ').filter((word) => !searchWords.has(word)).length);

  // Then: prefer a volume-number match, a year match, and best of all both.
  let volumeYearScore = 3;
  if (result.volumeNumber !== null && result.volumeNumber === volumeNumber) {
    volumeYearScore -= 1;
  }
  const [volumeYear, issueYear] = year;
  if (issueYear !== null && result.year !== null && issueYear === result.year) {
    volumeYearScore -= 2;
  } else if (
    volumeYear !== null &&
    issueYear !== null &&
    result.year !== null &&
    volumeYear - 1 <= result.year &&
    result.year <= issueYear + 1
  ) {
    volumeYearScore -= 1;
  }
  rating.push(volumeYearScore);

  // Then: how well the issue number fits.
  const resultIssue = result.issueNumber;
  if (calculatedIssueNumber !== null) {
    // Issue search.
    if (typeof resultIssue === 'number' && resultIssue === calculatedIssueNumber) {
      rating.push(0);
    } else if (Array.isArray(resultIssue)) {
      if (resultIssue[0] <= calculatedIssueNumber && calculatedIssueNumber <= resultIssue[1]) {
        // Inside the range — prefer tighter ranges.
        rating.push(1 - 1 / (resultIssue[1] - resultIssue[0] + 1));
      } else {
        // Outside the range, so this release is no use.
        rating.push(3);
      }
    } else if (result.specialVersion !== null) {
      rating.push(2);
    } else {
      rating.push(3);
    }
  } else {
    // Volume search — prefer releases covering more issues at once.
    if (Array.isArray(resultIssue)) {
      rating.push(1 / (resultIssue[1] - resultIssue[0] + 1));
    } else if (typeof resultIssue === 'number') {
      rating.push(1);
    }
  }

  return rating;
}

/** Compare two rank keys element-by-element; lower sorts first. */
export function compareRanks(a: number[], b: number[]): number {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const left = a[i] ?? 0;
    const right = b[i] ?? 0;
    if (left !== right) return left - right;
  }
  return 0;
}

/** Sort search results best-first, in place. */
export function sortSearchResults<T extends MatchedComicSearchResult>(
  results: T[],
  context: RankContext
): T[] {
  const keys = new Map<T, number[]>();
  for (const result of results) keys.set(result, rankSearchResult(result, context));
  return results.sort((a, b) => compareRanks(keys.get(a)!, keys.get(b)!));
}
