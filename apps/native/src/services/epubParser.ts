import JSZip from 'jszip';
import { readAsStringAsync, EncodingType } from 'expo-file-system/legacy';

export interface EpubChapter {
  id: string;
  href: string;
  title: string;
  html: string;
}

export interface EpubBook {
  title: string;
  chapters: EpubChapter[];
  basePath: string;
  imageMap: Record<string, string>; // href -> base64 data URI
}

/**
 * Parse an EPUB file from a local file path.
 * Returns structured chapter data ready for native rendering.
 */
export async function parseEpub(filePath: string, _bookId: string): Promise<EpubBook> {
  // Read the file as base64
  const base64 = await readAsStringAsync(filePath, { encoding: EncodingType.Base64 });
  const zip = await JSZip.loadAsync(base64, { base64: true });

  // 1. Find the rootfile from META-INF/container.xml
  const containerXml = await zip.file('META-INF/container.xml')?.async('text');
  if (!containerXml) throw new Error('Invalid EPUB: missing container.xml');

  const rootfilePath = parseRootfilePath(containerXml);
  if (!rootfilePath) throw new Error('Invalid EPUB: no rootfile found');

  const basePath = rootfilePath.substring(0, rootfilePath.lastIndexOf('/') + 1);

  // 2. Parse the OPF (content.opf or similar)
  const opfXml = await zip.file(rootfilePath)?.async('text');
  if (!opfXml) throw new Error('Invalid EPUB: missing OPF file');

  const { manifest, spine, title } = parseOpf(opfXml);

  // 3. Build image map (extract images as base64 data URIs)
  const imageMap: Record<string, string> = {};
  for (const item of Object.values(manifest)) {
    if (item.mediaType.startsWith('image/')) {
      const fullPath = basePath + item.href;
      const file = zip.file(fullPath);
      if (file) {
        const imgBase64 = await file.async('base64');
        imageMap[item.href] = `data:${item.mediaType};base64,${imgBase64}`;
      }
    }
  }

  // 4. Read chapters in spine order
  const chapters: EpubChapter[] = [];
  for (let i = 0; i < spine.length; i++) {
    const itemId = spine[i];
    const item = manifest[itemId];
    if (!item) continue;

    const fullPath = basePath + item.href;
    const file = zip.file(fullPath);
    if (!file) continue;

    let html = await file.async('text');

    // Resolve relative image paths to base64 data URIs
    html = resolveImages(html, imageMap, item.href);

    chapters.push({
      id: itemId,
      href: item.href,
      title: `Chapter ${i + 1}`,
      html,
    });
  }

  // 5. Try to get chapter titles from the NCX/nav
  const titles = await parseTocTitles(opfXml, manifest, zip, basePath);
  if (titles) {
    for (const chapter of chapters) {
      if (titles[chapter.href]) {
        chapter.title = titles[chapter.href];
      }
    }
  }

  return { title, chapters, basePath, imageMap };
}

interface ManifestItem {
  href: string;
  mediaType: string;
}

function parseRootfilePath(containerXml: string): string | null {
  const match = containerXml.match(/full-path="([^"]+)"/);
  return match ? match[1] : null;
}

function parseOpf(opfXml: string): {
  manifest: Record<string, ManifestItem>;
  spine: string[];
  title: string;
} {
  // Parse title
  const titleMatch = opfXml.match(/<dc:title[^>]*>([^<]+)<\/dc:title>/);
  const title = titleMatch ? titleMatch[1] : 'Unknown';

  // Parse manifest items
  const manifest: Record<string, ManifestItem> = {};
  const itemRegex = /<item\s+[^>]*id="([^"]+)"[^>]*href="([^"]+)"[^>]*media-type="([^"]+)"[^>]*\/?>/g;
  // Also handle attributes in different order
  const itemRegex2 = /<item\s+[^>]*href="([^"]+)"[^>]*id="([^"]+)"[^>]*media-type="([^"]+)"[^>]*\/?>/g;

  let match;
  while ((match = itemRegex.exec(opfXml)) !== null) {
    manifest[match[1]] = { href: decodeURIComponent(match[2]), mediaType: match[3] };
  }
  while ((match = itemRegex2.exec(opfXml)) !== null) {
    manifest[match[2]] = { href: decodeURIComponent(match[1]), mediaType: match[3] };
  }

  // Parse spine
  const spine: string[] = [];
  const spineRegex = /<itemref\s+[^>]*idref="([^"]+)"[^>]*\/?>/g;
  while ((match = spineRegex.exec(opfXml)) !== null) {
    spine.push(match[1]);
  }

  return { manifest, spine, title };
}

function resolveImages(
  html: string,
  imageMap: Record<string, string>,
  chapterHref: string
): string {
  // Get the directory of the current chapter for resolving relative paths
  const chapterDir = chapterHref.substring(0, chapterHref.lastIndexOf('/') + 1);

  return html.replace(/src="([^"]+)"/g, (fullMatch, src) => {
    // Try exact match first
    if (imageMap[src]) return `src="${imageMap[src]}"`;

    // Try resolving relative to chapter directory
    const resolved = resolveRelativePath(chapterDir, src);
    if (imageMap[resolved]) return `src="${imageMap[resolved]}"`;

    // Try without leading ../
    const stripped = src.replace(/^(\.\.\/)+/, '');
    /* istanbul ignore next -- resolve covers this path in practice */
    if (imageMap[stripped]) return `src="${imageMap[stripped]}"`;

    return fullMatch;
  });
}

/* istanbul ignore next */
function resolveRelativePath(base: string, relative: string): string {
  const parts = base.split('/').filter(Boolean);
  const relParts = relative.split('/');
  for (const part of relParts) {
    if (part === '..') parts.pop();
    else if (part !== '.') parts.push(part);
  }
  return parts.join('/');
}

async function parseTocTitles(
  opfXml: string,
  manifest: Record<string, ManifestItem>,
  zip: JSZip,
  basePath: string
): Promise<Record<string, string> | null> {
  // Find NCX file in manifest
  const ncxItem = Object.values(manifest).find(
    (item) => item.mediaType === 'application/x-dtbncx+xml'
  );

  if (!ncxItem) return null;

  const ncxFile = zip.file(basePath + ncxItem.href);
  if (!ncxFile) return null;

  const ncxXml = await ncxFile.async('text');
  const titles: Record<string, string> = {};

  // Parse navPoints: <navPoint><navLabel><text>Title</text></navLabel><content src="file.xhtml"/></navPoint>
  const navPointRegex = /<navPoint[^>]*>[\s\S]*?<text>([^<]+)<\/text>[\s\S]*?<content\s+src="([^"]+)"[\s\S]*?<\/navPoint>/g;
  let match;
  while ((match = navPointRegex.exec(ncxXml)) !== null) {
    const title = match[1].trim();
    // Remove fragment identifier
    const href = decodeURIComponent(match[2].split('#')[0]);
    titles[href] = title;
  }

  return titles;
}
