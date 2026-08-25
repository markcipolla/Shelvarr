/**
 * Naming templates for downloaded comics.
 *
 * Pure — no `fs`, no database — so it can back a live preview in the settings
 * UI the way `organizer/template.ts` does for books.
 *
 * Templates and their defaults follow Kapowarr (GPL-3.0,
 * `backend/internals/settings.py` and `backend/implementations/naming.py`)
 * so that a library organised by Kapowarr keeps the same layout after the
 * switch — see NOTICE.md.
 */

import type { IssueNumber, SpecialVersion } from '@shelvarr/types';
import { sanitizePathComponent } from '../organizer/template';

/** `Series Name/Volume 01 (2019)` */
export const DEFAULT_VOLUME_FOLDER_TEMPLATE = '{series_name}/Volume {volume_number} ({year})';

/** `Series Name (2019) Volume 01 Issue 003` */
export const DEFAULT_ISSUE_TEMPLATE =
  '{series_name} ({year}) Volume {volume_number} Issue {issue_number}';

/** `Series Name (2019) Volume 01 TPB` */
export const DEFAULT_SPECIAL_VERSION_TEMPLATE =
  '{series_name} ({year}) Volume {volume_number} {special_version}';

/** For volume-as-issue series, where each "issue" is really a volume. */
export const DEFAULT_VOLUME_AS_ISSUE_TEMPLATE = '{series_name} ({year}) Volume {issue_number}';

/** Zero-padding widths, matching Kapowarr's defaults. */
export const VOLUME_PADDING = 2;
export const ISSUE_PADDING = 3;

export interface NamingVolume {
  title: string;
  year: number | null;
  volumeNumber: number | null;
  publisher?: string | null;
  specialVersion: SpecialVersion | null;
}

export interface NamingTemplates {
  volumeFolder?: string;
  issue?: string;
  specialVersion?: string;
  volumeAsIssue?: string;
}

/** Human-readable labels for special versions, as they appear in filenames. */
const SPECIAL_VERSION_LABELS: Partial<Record<SpecialVersion, string>> = {
  tpb: 'TPB',
  'one-shot': 'One-Shot',
  'hard-cover': 'Hard-Cover',
  omnibus: 'Omnibus',
};

/**
 * Format an issue number for a filename. Ranges become `003-007`; fractional
 * issues keep their decimal (`003.5`).
 */
export function formatIssueNumber(issueNumber: IssueNumber, padding = ISSUE_PADDING): string {
  if (issueNumber === null) return '';

  const one = (value: number): string => {
    const negative = value < 0;
    const absolute = Math.abs(value);
    const whole = Math.trunc(absolute);
    const fraction = absolute - whole;
    const padded = String(whole).padStart(padding, '0');
    const text = fraction
      ? `${padded}.${String(Math.round(fraction * 1000)).replace(/0+$/, '')}`
      : padded;
    return negative ? `-${text}` : text;
  };

  if (Array.isArray(issueNumber)) {
    return issueNumber[0] === issueNumber[1]
      ? one(issueNumber[0])
      : `${one(issueNumber[0])}-${one(issueNumber[1])}`;
  }
  return one(issueNumber);
}

/**
 * Replace `{placeholder}`s, then tidy up the gaps left behind by empty values
 * — `Batman () Volume  Issue 003` would otherwise be a common outcome for
 * volumes with unknown years.
 */
function fillTemplate(template: string, values: Record<string, string>): string {
  return template
    .replace(/\{\{(\w+)\}\}/g, '{$1}')
    .replace(/\{(\w+)\}/g, (_, key: string) => values[key] ?? '')
    .replace(/\(\s*\)/g, '')
    .replace(/\[\s*\]/g, '')
    .split('/')
    .map((segment) => segment.replace(/\s{2,}/g, ' ').trim())
    .filter((segment) => segment !== '')
    .join('/');
}

function baseValues(volume: NamingVolume): Record<string, string> {
  return {
    series_name: sanitizePathComponent(volume.title, 'Unknown Series'),
    year: volume.year !== null ? String(volume.year) : '',
    volume_number:
      volume.volumeNumber !== null
        ? String(volume.volumeNumber).padStart(VOLUME_PADDING, '0')
        : '',
    publisher: sanitizePathComponent(volume.publisher ?? ''),
    special_version: volume.specialVersion
      ? SPECIAL_VERSION_LABELS[volume.specialVersion] ?? volume.specialVersion
      : '',
  };
}

/** The folder a volume's files live in, relative to the comic library root. */
export function generateVolumeFolderName(
  volume: NamingVolume,
  templates: NamingTemplates = {}
): string {
  return fillTemplate(
    templates.volumeFolder ?? DEFAULT_VOLUME_FOLDER_TEMPLATE,
    baseValues(volume)
  );
}

/**
 * The filename (without extension) for a downloaded issue.
 *
 * Picks the template that fits: special-version volumes and volume-as-issue
 * series each name their files differently.
 */
export function generateIssueName(
  volume: NamingVolume,
  issueNumber: IssueNumber,
  templates: NamingTemplates = {}
): string {
  const values = {
    ...baseValues(volume),
    issue_number: formatIssueNumber(issueNumber),
  };

  let template: string;
  if (volume.specialVersion === 'volume-as-issue') {
    template = templates.volumeAsIssue ?? DEFAULT_VOLUME_AS_ISSUE_TEMPLATE;
  } else if (volume.specialVersion !== null && volume.specialVersion !== 'cover') {
    template = templates.specialVersion ?? DEFAULT_SPECIAL_VERSION_TEMPLATE;
  } else {
    template = templates.issue ?? DEFAULT_ISSUE_TEMPLATE;
  }

  return sanitizePathComponent(fillTemplate(template, values), 'Unknown Issue');
}
