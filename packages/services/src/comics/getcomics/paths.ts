/**
 * Work out which combination of download groups on a single article gets us
 * the most content without downloading the same issue twice.
 *
 * A post might offer "TPB + Extras", "TPB", "Issues 1-5" and "Issues 6-10".
 * Path 1 is `[TPB + Extras]`, path 2 is `[TPB]`, path 3 is
 * `[Issues 1-5, Issues 6-10]`. Paths after the first are fallbacks for when
 * the preceding path's links turn out to be dead.
 *
 * Derived from Kapowarr (GPL-3.0) `backend/implementations/getcomics.py`
 * (`_create_link_paths`, `__sort_link_paths`) — see NOTICE.md.
 */

import type { DownloadGroup } from '@shelvarr/types';
import { checkOverlappingIssues, forceRange } from './normalise';
import { downloadGroupFilter, type VolumeIssueData, type VolumeMatchData } from './match';
import { refineSpecialVersion } from './parse';

export interface LinkPathInput {
  groups: DownloadGroup[];
  volume: VolumeMatchData;
  issues: VolumeIssueData[];
  /** Year of the volume's last issue; falls back to the volume year. */
  endingYear?: number | null;
  /** Take everything on the page regardless of whether it matches. */
  forceMatch?: boolean;
}

/**
 * Sort key for a path: special versions first, then widest coverage, then
 * fewest downloads for equal coverage. Lower sorts first.
 */
function pathRank(path: DownloadGroup[]): [number, number] {
  const first = path[0];
  if (first?.info.specialVersion) return [0, 0];

  const covered = path.reduce((total, group) => {
    if (group.info.issueNumber === null) return total;
    const [start, end] = forceRange(group.info.issueNumber);
    return total + (end - start || 1);
  }, 0);

  return [covered === 0 ? Infinity : 1 / covered, path.length];
}

/**
 * Build the candidate paths through an article's download groups, best first.
 */
export function createLinkPaths(input: LinkPathInput): DownloadGroup[][] {
  const { groups, volume, issues, endingYear = null, forceMatch = false } = input;

  const paths: DownloadGroup[][] = [];
  if (forceMatch) paths.push([]);

  for (const group of groups) {
    if (!forceMatch && !downloadGroupFilter(group.info, volume, endingYear, issues)) {
      continue;
    }

    const refined: DownloadGroup = {
      ...group,
      info: refineSpecialVersion(
        { specialVersion: volume.specialVersion, volumeNumber: volume.volumeNumber },
        group.info
      ),
    };

    if (forceMatch) {
      paths[0]!.push(refined);
      continue;
    }

    if (refined.info.specialVersion !== null) {
      // A special version is the whole volume — it gets a path to itself.
      paths.push([refined]);
      continue;
    }

    // Otherwise slot it into the first path where nothing already covers
    // these issues.
    const fits = paths.find((path) =>
      path.every(
        (entry) =>
          entry.info.specialVersion === null &&
          entry.info.issueNumber !== null &&
          refined.info.issueNumber !== null &&
          !checkOverlappingIssues(entry.info.issueNumber, refined.info.issueNumber)
      )
    );

    if (fits) fits.push(refined);
    else paths.push([refined]);
  }

  return paths.sort((a, b) => {
    const [rankA, lengthA] = pathRank(a);
    const [rankB, lengthB] = pathRank(b);
    if (rankA !== rankB) return rankA - rankB;
    return lengthA - lengthB;
  });
}
