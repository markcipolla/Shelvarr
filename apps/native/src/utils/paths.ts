import { documentDirectory } from 'expo-file-system/legacy';
import { DOWNLOADS_DIR, EXTRACTED_DIR } from './constants';

export function getDownloadsDir(): string {
  return `${documentDirectory}${DOWNLOADS_DIR}/`;
}

export function getExtractedDir(): string {
  return `${documentDirectory}${EXTRACTED_DIR}/`;
}

export function getBookDownloadPath(bookId: string, extension: string): string {
  return `${getDownloadsDir()}${bookId}${extension}`;
}

export function getBookExtractDir(bookId: string): string {
  return `${getExtractedDir()}${bookId}/`;
}
