import {
  getInfoAsync,
  makeDirectoryAsync,
  deleteAsync,
  readDirectoryAsync,
  createDownloadResumable,
} from 'expo-file-system/legacy';
import { getDownloadsDir, getExtractedDir, getBookDownloadPath, getBookExtractDir } from '../utils/paths';

export async function ensureDirectories(): Promise<void> {
  const dirs = [getDownloadsDir(), getExtractedDir()];
  for (const dir of dirs) {
    const info = await getInfoAsync(dir);
    if (!info.exists) {
      await makeDirectoryAsync(dir, { intermediates: true });
    }
  }
}

export async function downloadBookFile(
  downloadUrl: string,
  bookId: string,
  extension: string,
  headers: Record<string, string>,
  onProgress?: (progress: number) => void
): Promise<string> {
  await ensureDirectories();
  const filePath = getBookDownloadPath(bookId, extension);

  const downloadResumable = createDownloadResumable(
    downloadUrl,
    filePath,
    { headers },
    (downloadProgress) => {
      const progress =
        downloadProgress.totalBytesWritten / downloadProgress.totalBytesExpectedToWrite;
      onProgress?.(progress);
    }
  );

  const result = await downloadResumable.downloadAsync();
  if (!result) throw new Error('Download failed');
  return result.uri;
}

export async function deleteBookFiles(bookId: string, extension: string): Promise<void> {
  const filePath = getBookDownloadPath(bookId, extension);
  const extractDir = getBookExtractDir(bookId);

  try {
    const fileInfo = await getInfoAsync(filePath);
    if (fileInfo.exists) {
      await deleteAsync(filePath, { idempotent: true });
    }
  } catch {}

  try {
    const dirInfo = await getInfoAsync(extractDir);
    if (dirInfo.exists) {
      await deleteAsync(extractDir, { idempotent: true });
    }
  } catch {}
}

export async function listExtractedFiles(bookId: string): Promise<string[]> {
  const dir = getBookExtractDir(bookId);
  const info = await getInfoAsync(dir);
  if (!info.exists) return [];

  const files = await readDirectoryAsync(dir);
  return files
    .filter((f) => /\.(jpg|jpeg|png|gif|webp)$/i.test(f))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
}

export async function cleanAllDownloads(): Promise<void> {
  try {
    await deleteAsync(getDownloadsDir(), { idempotent: true });
    await deleteAsync(getExtractedDir(), { idempotent: true });
  } catch {}
}
