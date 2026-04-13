import { encode as btoa } from 'base-64';
import { Book, DownloadedBook } from '../types/komga';
import { getMediaFormat, getFileExtension, isComicFormat, getFormatFromName } from '../utils/fileTypes';
import { useAuthStore } from '../stores/useAuthStore';
import { useDownloadStore } from '../stores/useDownloadStore';
import { downloadBookFile } from './fileManager';
import { getBookExtractDir, getBookDownloadPath } from '../utils/paths';
import {
  getInfoAsync,
  makeDirectoryAsync,
  createDownloadResumable,
  readDirectoryAsync,
} from 'expo-file-system/legacy';

function getAuthHeaders(): Record<string, string> {
  const { credentials, sessionCookie } = useAuthStore.getState();
  const headers: Record<string, string> = {};
  /* istanbul ignore next -- callers check credentials before calling */
  if (!credentials) return headers;

  if (sessionCookie) {
    headers['Cookie'] = `KOMGA-SESSION=${sessionCookie}`;
  }
  if (credentials.authType === 'basic' && credentials.username && credentials.password) {
    headers['Authorization'] = `Basic ${btoa(`${credentials.username}:${credentials.password}`)}`;
  } else /* istanbul ignore next */ if (credentials.authType === 'apikey' && credentials.apiKey) {
    headers['X-API-Key'] = credentials.apiKey;
  }
  return headers;
}

function getFormat(book: Book) {
  const format = getMediaFormat(book.media.mediaType);
  return format !== 'unknown' ? format : getFormatFromName(book.name);
}

/**
 * For comics: download all page images from Komga's page API.
 * Returns the directory containing the downloaded images.
 */
async function downloadComicPages(
  book: Book
): Promise<string> {
  const { credentials } = useAuthStore.getState();
  /* istanbul ignore next -- prepareBookForReading checks credentials first */
  if (!credentials) throw new Error('Not authenticated');

  const pagesDir = getBookExtractDir(book.id);
  const headers = getAuthHeaders();
  const store = useDownloadStore.getState();
  const totalPages = book.media.pagesCount;

  // Check if already downloaded
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

      // Skip already downloaded pages
      const fileInfo = await getInfoAsync(filePath);
      if (fileInfo.exists) {
        store.setActiveDownload(book.id, i / totalPages);
        continue;
      }

      const url = `${credentials.serverUrl}/api/v1/books/${book.id}/pages/${i}`;
      const dl = createDownloadResumable(url, filePath, { headers });
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

export async function prepareBookForReading(
  book: Book
): Promise<{ filePath: string; extractedDir?: string }> {
  const format = getFormat(book);
  const { credentials } = useAuthStore.getState();

  if (!credentials) throw new Error('Not authenticated');

  const store = useDownloadStore.getState();

  // Comics: download page images instead of the archive file
  if (isComicFormat(format)) {
    // Check store first
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
    store.setDownload(book.id, {
      bookId: book.id,
      filePath: pagesDir,
      format,
      extractedDir: pagesDir,
      downloadedAt: Date.now(),
    });
    return { filePath: pagesDir, extractedDir: pagesDir };
  }

  // Non-comics (EPUB, PDF): download the whole file
  const extension = getFileExtension(format);

  // Check if already downloaded
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
    store.setDownload(book.id, {
      bookId: book.id,
      filePath: expectedPath,
      format,
      downloadedAt: Date.now(),
    });
    return { filePath: expectedPath };
  }

  // Download the file
  const url = `${credentials.serverUrl}/api/v1/books/${book.id}/file`;
  const headers = getAuthHeaders();

  store.setActiveDownload(book.id, 0);

  try {
    const filePath = await downloadBookFile(url, book.id, extension, headers, (progress) => {
      store.setActiveDownload(book.id, progress);
    });

    const download: DownloadedBook = {
      bookId: book.id,
      filePath,
      format,
      downloadedAt: Date.now(),
    };
    store.setDownload(book.id, download);
    store.setActiveDownload(null);

    return { filePath };
  } catch (err) {
    store.setActiveDownload(null);
    throw err;
  }
}
