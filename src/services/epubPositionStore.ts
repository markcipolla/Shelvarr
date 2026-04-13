import {
  readAsStringAsync,
  writeAsStringAsync,
  documentDirectory,
} from 'expo-file-system/legacy';

interface EpubPosition {
  chapter: number;
  page: number;
}

const FILE_PATH = `${documentDirectory}epub-positions.json`;

let cache: Record<string, EpubPosition> | null = null;

async function load(): Promise<Record<string, EpubPosition>> {
  if (cache) return cache;
  try {
    const json = await readAsStringAsync(FILE_PATH);
    cache = JSON.parse(json);
    return cache!;
  } catch {
    cache = {};
    return cache;
  }
}

export async function getEpubPosition(bookId: string): Promise<EpubPosition | null> {
  const data = await load();
  return data[bookId] ?? null;
}

export async function saveEpubPosition(bookId: string, chapter: number, page: number): Promise<void> {
  const data = await load();
  data[bookId] = { chapter, page };
  cache = data;
  await writeAsStringAsync(FILE_PATH, JSON.stringify(data));
}
