import {
  getInfoAsync,
  makeDirectoryAsync,
  deleteAsync,
  readDirectoryAsync,
  createDownloadResumable,
  readAsStringAsync,
  writeAsStringAsync,
  EncodingType,
} from 'expo-file-system/legacy';
import JSZip from 'jszip';
import { getDownloadsDir, getExtractedDir, getBookDownloadPath, getBookExtractDir } from '../utils/paths';

/** Thrown when a file download completes with a non-2xx HTTP status. */
export class DownloadHttpError extends Error {
  status: number;
  detail: string;
  constructor(status: number, detail: string) {
    super(`Server returned ${status}${detail ? `: ${detail}` : ''}`);
    this.name = 'DownloadHttpError';
    this.status = status;
    this.detail = detail;
  }
}

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
      const { totalBytesWritten, totalBytesExpectedToWrite } = downloadProgress;
      // When the server omits Content-Length, expo reports the expected size as
      // -1 (or 0). Dividing by that yields a nonsensical negative percentage, so
      // treat the total as unknown and report 0 until the download completes.
      const progress =
        totalBytesExpectedToWrite > 0
          ? Math.min(1, Math.max(0, totalBytesWritten / totalBytesExpectedToWrite))
          : 0;
      onProgress?.(progress);
    }
  );

  const result = await downloadResumable.downloadAsync();
  if (!result) throw new Error('Download failed');

  // createDownloadResumable resolves even on HTTP errors, writing the error
  // response body to the file. Detect non-2xx and surface the server's message
  // instead of letting extraction later fail on the garbage body.
  if (result.status < 200 || result.status >= 300) {
    let detail = '';
    try {
      const body = await readAsStringAsync(result.uri);
      try {
        const parsed = JSON.parse(body);
        detail = parsed.error || body;
      } catch {
        detail = body;
      }
    } catch {
      // Couldn't read the body — the status code below is enough to report.
    }
    await deleteAsync(result.uri, { idempotent: true }).catch(() => {});
    throw new DownloadHttpError(result.status, detail.trim().slice(0, 300));
  }

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
  } catch {
    // Nothing to clean up, or the file is already gone. Either is fine.
  }

  try {
    const dirInfo = await getInfoAsync(extractDir);
    if (dirInfo.exists) {
      await deleteAsync(extractDir, { idempotent: true });
    }
  } catch {
    // As above: a missing extract directory is the desired end state anyway.
  }
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
  } catch {
    // Clearing downloads is best-effort; a partial clean is still a clean.
  }
}

export async function extractComicArchive(
  filePath: string,
  key: string
): Promise<{ dir: string; pageCount: number }> {
  const base64 = await readAsStringAsync(filePath, { encoding: EncodingType.Base64 });
  const zip = await JSZip.loadAsync(base64, { base64: true });

  const imageEntries = Object.values(zip.files).filter(
    (entry) => !entry.dir && /\.(jpe?g|png|gif|webp)$/i.test(entry.name)
  );
  imageEntries.sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { numeric: true })
  );

  const dir = getBookExtractDir(key);
  const dirInfo = await getInfoAsync(dir);
  if (!dirInfo.exists) {
    await makeDirectoryAsync(dir, { intermediates: true });
  }

  for (let i = 0; i < imageEntries.length; i++) {
    const entry = imageEntries[i];
    const ext = entry.name.match(/\.(jpe?g|png|gif|webp)$/i)?.[0] ?? '.jpg';
    const padded = String(i).padStart(5, '0');
    const destPath = `${dir}${padded}${ext}`;
    const imgBase64 = await entry.async('base64');
    await writeAsStringAsync(destPath, imgBase64, { encoding: EncodingType.Base64 });
  }

  return { dir, pageCount: imageEntries.length };
}
