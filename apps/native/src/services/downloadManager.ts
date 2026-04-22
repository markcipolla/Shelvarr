import { Book, DownloadedBook } from '../types/komga';
import { getMediaFormat, getFileExtension, isComicFormat, getFormatFromName } from '../utils/fileTypes';
import { useSettingsStore } from '../stores/useSettingsStore';
import { useDownloadStore } from '../stores/useDownloadStore';
import { downloadBookFile, deleteBookFiles } from './fileManager';
import { getBookExtractDir, getBookDownloadPath } from '../utils/paths';
import {
  getInfoAsync,
  makeDirectoryAsync,
  createDownloadResumable,
  readDirectoryAsync,
} from 'expo-file-system/legacy';

function getServerUrl(): string {
  const { shelvarrUrl } = useSettingsStore.getState();
  if (!shelvarrUrl) throw new Error('Server URL not configured');
  return shelvarrUrl;
}

function getFormat(book: Book) {
  const format = getMediaFormat(book.media.mediaType);
  return format !== 'unknown' ? format : getFormatFromName(book.name);
}

async function downloadComicPages(book: Book): Promise<string> {
  const serverUrl = getServerUrl();
  const pagesDir = getBookExtractDir(book.id);
  const store = useDownloadStore.getState();
  const totalPages = book.media.pagesCount;

  const dirInfo = await getInfoAsync(pagesDir);
  if (dirInfo.exists) {
    const files = await readDirectoryAsync(pagesDir);
    const imageFiles = files.filter((f) => /\.(jpg|jpeg|png|gif|webp)$/i.test(f));
    if (imageFiles.length >= totalPages) {
      return pagesDir;
    }
  } else {
    await makeDirectoryAsync(pagesDir, { intermediates: true });
  }

  store.setActiveDownload(book.id, 0);

  try {
    for (let i = 1; i <= totalPages; i++) {
      const padded = String(i).padStart(5, '0');
      const filePath = `${pagesDir}${padded}.jpg`;

      const fileInfo = await getInfoAsync(filePath);
      if (fileInfo.exists) {
        store.setActiveDownload(book.id, i / totalPages);
        continue;
      }

      const url = `${serverUrl}/api/books/${book.id}/pages/${i}`;
      const dl = createDownloadResumable(url, filePath, {});
      const result = await dl.downloadAsync();
      if (!result) throw new Error(`Failed to download page ${i}`);

      store.setActiveDownload(book.id, i / totalPages);
    }

    store.setActiveDownload(null);
    return pagesDir;
  } catch (err) {
    store.setActiveDownload(null);
    throw err;
  }
}

async function ensureDownloaded(
  book: Book
): Promise<{ filePath: string; extractedDir?: string }> {
  const format = getFormat(book);
  const serverUrl = getServerUrl();
  const store = useDownloadStore.getState();

  if (isComicFormat(format)) {
    const existing = store.downloads[book.id];
    if (existing?.extractedDir) {
      const dirInfo = await getInfoAsync(existing.extractedDir);
      if (dirInfo.exists) {
        const files = await readDirectoryAsync(existing.extractedDir);
        const imageFiles = files.filter((f) => /\.(jpg|jpeg|png|gif|webp)$/i.test(f));
        if (imageFiles.length >= book.media.pagesCount) {
          return { filePath: existing.extractedDir, extractedDir: existing.extractedDir };
        }
      }
    }

    const pagesDir = await downloadComicPages(book);
    return { filePath: pagesDir, extractedDir: pagesDir };
  }

  const extension = getFileExtension(format);

  const existing = store.downloads[book.id];
  if (existing) {
    const info = await getInfoAsync(existing.filePath);
    if (info.exists) {
      return { filePath: existing.filePath, extractedDir: existing.extractedDir };
    }
    store.removeDownload(book.id);
  }

  const expectedPath = getBookDownloadPath(book.id, extension);
  const fileInfo = await getInfoAsync(expectedPath);
  if (fileInfo.exists) {
    return { filePath: expectedPath };
  }

  const url = `${serverUrl}/api/books/${book.id}/file`;
  store.setActiveDownload(book.id, 0);

  try {
    const filePath = await downloadBookFile(url, book.id, extension, {}, (progress) => {
      store.setActiveDownload(book.id, progress);
    });
    store.setActiveDownload(null);
    return { filePath };
  } catch (err) {
    store.setActiveDownload(null);
    throw err;
  }
}

function recordDownload(
  book: Book,
  filePath: string,
  extractedDir: string | undefined,
  persisted: boolean
): DownloadedBook {
  const store = useDownloadStore.getState();
  const existing = store.downloads[book.id];
  const format = getFormat(book);
  const download: DownloadedBook = {
    bookId: book.id,
    filePath,
    format,
    extractedDir,
    downloadedAt: existing?.downloadedAt ?? Date.now(),
    persisted: persisted || existing?.persisted || false,
    book,
  };
  store.setDownload(book.id, download);
  return download;
}

export async function prepareBookForReading(
  book: Book
): Promise<{ filePath: string; extractedDir?: string }> {
  const result = await ensureDownloaded(book);
  recordDownload(book, result.filePath, result.extractedDir, false);
  return result;
}

export async function downloadBook(book: Book): Promise<DownloadedBook> {
  const result = await ensureDownloaded(book);
  return recordDownload(book, result.filePath, result.extractedDir, true);
}

export async function removeDownloadedBook(bookId: string): Promise<void> {
  const store = useDownloadStore.getState();
  const existing = store.downloads[bookId];
  if (!existing) return;
  await deleteBookFiles(bookId, getFileExtension(existing.format));
  store.removeDownload(bookId);
}
