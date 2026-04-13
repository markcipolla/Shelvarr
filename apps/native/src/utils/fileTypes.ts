import { MediaFormat } from '../types/komga';

const MEDIA_TYPE_MAP: Record<string, MediaFormat> = {
  'application/epub+zip': 'epub',
  'application/pdf': 'pdf',
  'application/x-cbz': 'cbz',
  'application/zip': 'cbz',
  'application/vnd.comicbook+zip': 'cbz',
  'application/x-cbr': 'cbr',
  'application/x-rar-compressed': 'cbr',
  'application/x-rar-compressed;verion=4': 'cbr',
  'application/x-rar-compressed;version=4': 'cbr',
  'application/x-rar-compressed;version=5': 'cbr',
  'application/vnd.comicbook-rar': 'cbr',
  'application/vnd.rar': 'cbr',
  'application/x-rar': 'cbr',
};

export function getMediaFormat(mediaType: string): MediaFormat {
  const lower = mediaType.toLowerCase().trim();
  // Try exact match first
  if (MEDIA_TYPE_MAP[lower]) return MEDIA_TYPE_MAP[lower];
  // Try stripping parameters (e.g. "application/x-rar-compressed;verion=4" -> "application/x-rar-compressed")
  const base = lower.split(';')[0].trim();
  if (MEDIA_TYPE_MAP[base]) return MEDIA_TYPE_MAP[base];
  console.warn('Unknown media type:', mediaType);
  return 'unknown';
}

/**
 * Fallback: infer format from the book file name if mediaType mapping fails.
 */
export function getFormatFromName(fileName: string): MediaFormat {
  const lower = fileName.toLowerCase();
  if (lower.endsWith('.epub')) return 'epub';
  if (lower.endsWith('.pdf')) return 'pdf';
  if (lower.endsWith('.cbz')) return 'cbz';
  if (lower.endsWith('.cbr')) return 'cbr';
  if (lower.endsWith('.zip')) return 'cbz';
  if (lower.endsWith('.rar')) return 'cbr';
  return 'unknown';
}

export function getFileExtension(format: MediaFormat): string {
  switch (format) {
    case 'epub': return '.epub';
    case 'pdf': return '.pdf';
    case 'cbz': return '.cbz';
    case 'cbr': return '.cbr';
    default: return '';
  }
}

export function isComicFormat(format: MediaFormat): boolean {
  return format === 'cbz' || format === 'cbr';
}
