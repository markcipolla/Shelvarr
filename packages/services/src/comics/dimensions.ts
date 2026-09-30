/**
 * Intrinsic pixel dimensions read straight out of an image file's header.
 *
 * Why this exists rather than `sharp` or `image-size`: the only question the
 * caller ever asks of a comic page is "how wide is it relative to its
 * height?", so that a landscape page can be shown as the double-page spread
 * it is instead of being squeezed into a single-page slot. That is a decision
 * about two integers. Every image format already writes those two integers
 * into a fixed, well-documented spot near the front of the file, so answering
 * the question costs a few dozen bytes of arithmetic. Decoding the pixels to
 * find them out would be orders of magnitude more expensive — megabytes of
 * allocation and a full inflate/Huffman pass per page, on a route that may
 * walk every page of an issue.
 *
 * `sharp` would also mean a native, platform-specific binary in the install,
 * which this repo has deliberately never taken on (see the notes in
 * `archive.ts` about how much trouble a *single* wasm dependency already
 * causes under Next's bundler). `image-size` is pure JS and would work, but
 * it is a dependency, a supply-chain surface, and a version to keep current,
 * in exchange for roughly the code below. So: no dependency, and no `Buffer`
 * either — plain `DataView` and byte arithmetic keep this runnable and
 * testable anywhere, even though today it only runs server-side.
 *
 * **Never throws.** This is the contract, not a nicety. The bytes come out of
 * a comic archive assembled by a stranger years ago: a page can be truncated,
 * zero length, mislabelled `.jpg` while holding something else entirely, or
 * simply corrupt. None of that is worth a 500 on a page-listing request — the
 * right behaviour is to shrug and let the caller fall back to its default
 * layout. So every read is bounds-checked *before* it happens, and anything
 * unrecognised, malformed or nonsensical (a zero or negative dimension)
 * returns `null`.
 *
 * The four formats handled are exactly those `IMAGE_RE` in `archive.ts`
 * accepts as comic pages: PNG (including APNG, whose `IHDR` is unchanged),
 * JPEG, GIF and WebP.
 */

export interface ImageDimensions {
  width: number;
  height: number;
}

/** Read a big-endian uint32, or `null` if it would run past the end. */
function beUint32(view: DataView, offset: number): number | null {
  if (offset < 0 || offset + 4 > view.byteLength) return null;
  return view.getUint32(offset, false);
}

/** Read a big-endian uint16, or `null` if it would run past the end. */
function beUint16(view: DataView, offset: number): number | null {
  if (offset < 0 || offset + 2 > view.byteLength) return null;
  return view.getUint16(offset, false);
}

/** Read a little-endian uint16, or `null` if it would run past the end. */
function leUint16(view: DataView, offset: number): number | null {
  if (offset < 0 || offset + 2 > view.byteLength) return null;
  return view.getUint16(offset, true);
}

/** Read a little-endian uint24, or `null` if it would run past the end. */
function leUint24(view: DataView, offset: number): number | null {
  if (offset < 0 || offset + 3 > view.byteLength) return null;
  return view.getUint8(offset) | (view.getUint8(offset + 1) << 8) | (view.getUint8(offset + 2) << 16);
}

/** Read a little-endian uint32, or `null` if it would run past the end. */
function leUint32(view: DataView, offset: number): number | null {
  if (offset < 0 || offset + 4 > view.byteLength) return null;
  return view.getUint32(offset, true);
}

/** Compare bytes against ASCII magic, without decoding anything. */
function matchesAscii(bytes: Uint8Array, offset: number, magic: string): boolean {
  if (offset + magic.length > bytes.length) return false;
  for (let i = 0; i < magic.length; i++) {
    if (bytes[offset + i] !== magic.charCodeAt(i)) return false;
  }
  return true;
}

/**
 * Final gate for every parser: a header can be structurally valid and still
 * declare nonsense. Zero is the common one (a truncated write that zeroed the
 * field); negatives can only arrive from a malformed signed read, but the
 * check is free.
 */
function validate(width: number | null, height: number | null): ImageDimensions | null {
  if (width === null || height === null) return null;
  if (!Number.isFinite(width) || !Number.isFinite(height)) return null;
  if (width <= 0 || height <= 0) return null;
  return { width, height };
}

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

function isPng(bytes: Uint8Array): boolean {
  if (bytes.length < PNG_SIGNATURE.length) return false;
  return PNG_SIGNATURE.every((byte, i) => bytes[i] === byte);
}

/**
 * PNG: the spec requires `IHDR` to be the first chunk, so there is no walk to
 * do — 8-byte signature, 4-byte chunk length, 4-byte chunk type, then width
 * and height as big-endian uint32. APNG only adds later chunks, so an
 * animated page reports the dimensions of its first frame, which is what a
 * reader would display anyway.
 */
function readPng(bytes: Uint8Array, view: DataView): ImageDimensions | null {
  if (!matchesAscii(bytes, 12, 'IHDR')) return null;
  return validate(beUint32(view, 16), beUint32(view, 20));
}

/**
 * Markers that carry no length-prefixed payload, so the walk must step over
 * them by two bytes rather than reading a segment length that isn't there:
 * `D0`–`D7` (restart), `D8` (SOI) and `01` (TEM).
 */
function isStandaloneMarker(marker: number): boolean {
  return marker === 0x01 || marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7);
}

/**
 * Start-Of-Frame markers: the whole `C0`–`CF` family (baseline, extended,
 * progressive, lossless, and their arithmetic-coded and hierarchical
 * variants) *except* the three squatters in that range which are not frame
 * headers at all — `C4` (define Huffman tables), `C8` (reserved, "JPG") and
 * `CC` (define arithmetic coding conditioning). Treating a `C4` as a frame
 * header is the classic bug here: DHT segments are common, usually appear
 * before the SOF, and their payload would parse as a plausible-looking but
 * entirely fictional size.
 */
function isStartOfFrame(marker: number): boolean {
  if (marker < 0xc0 || marker > 0xcf) return false;
  return marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
}

/**
 * JPEG: no fixed offset, so walk the marker segments from `FFD8` until a SOF
 * turns up. Each segment is `FF`, a marker byte, then (for most markers) a
 * big-endian uint16 length that *includes* its own two bytes. Encoders are
 * permitted to pad with any number of `FF` fill bytes between segments, so
 * the loop consumes runs of them rather than assuming exactly one.
 *
 * The SOF payload is: 1 byte sample precision, then height and then width —
 * height first, which is the other classic bug in this parser.
 *
 * Deliberately stops at `DA` (start of scan): everything after it is entropy
 * -coded image data where a stray `FF` byte means nothing, and any file whose
 * dimensions we care about has declared them before then.
 */
function readJpeg(bytes: Uint8Array, view: DataView): ImageDimensions | null {
  let offset = 2;

  while (offset < bytes.length) {
    // Consume fill bytes; a segment can be preceded by a run of them.
    if (bytes[offset] !== 0xff) return null;
    while (offset < bytes.length && bytes[offset] === 0xff) offset++;
    if (offset >= bytes.length) return null;

    const marker = bytes[offset] ?? -1;
    offset++;

    if (marker === 0xd9 || marker === 0xda) return null; // EOI, or scan data begins.
    if (isStandaloneMarker(marker)) continue;

    const length = beUint16(view, offset);
    if (length === null || length < 2) return null;

    if (isStartOfFrame(marker)) {
      // offset + 2 skips the length field itself, + 1 more the precision byte.
      return validate(beUint16(view, offset + 5), beUint16(view, offset + 3));
    }

    offset += length;
  }

  return null;
}

/**
 * GIF: `GIF87a` or `GIF89a`, then the logical screen descriptor, whose first
 * four bytes are width and height as little-endian uint16. Individual frames
 * can be smaller than the logical screen, but the screen is the canvas a
 * reader draws, so it is the right number here.
 */
function readGif(view: DataView): ImageDimensions | null {
  return validate(leUint16(view, 6), leUint16(view, 8));
}

/**
 * WebP: a RIFF container whose first chunk names the bitstream flavour, each
 * of which stores its size differently.
 *
 * - `VP8 ` (lossy): a 3-byte frame tag, then the `9D 01 2A` sync code, then
 *   width and height as little-endian uint16 with the top two bits given over
 *   to a scaling hint — hence the 14-bit mask.
 * - `VP8L` (lossless): a `0x2F` signature byte, then 14 bits of width-1 and
 *   14 bits of height-1 packed into the following little-endian uint32.
 * - `VP8X` (extended — what an animated or alpha-carrying WebP uses): 4 bytes
 *   of flags, then 24-bit little-endian canvas width-1 and height-1.
 *
 * A `VP8X` file also contains a `VP8 ` or `VP8L` chunk further in, but the
 * extended header's canvas size is the authoritative display size, and it
 * comes first, so there is no need to walk the chunk list.
 */
function readWebp(bytes: Uint8Array, view: DataView): ImageDimensions | null {
  if (!matchesAscii(bytes, 8, 'WEBP')) return null;

  if (matchesAscii(bytes, 12, 'VP8X')) {
    const width = leUint24(view, 24);
    const height = leUint24(view, 27);
    if (width === null || height === null) return null;
    return validate(width + 1, height + 1);
  }

  if (matchesAscii(bytes, 12, 'VP8L')) {
    if (bytes[20] !== 0x2f) return null;
    const bits = leUint32(view, 21);
    if (bits === null) return null;
    return validate(1 + (bits & 0x3fff), 1 + ((bits >>> 14) & 0x3fff));
  }

  if (matchesAscii(bytes, 12, 'VP8 ')) {
    // The keyframe sync code; its absence means this is an interframe, which
    // carries no dimensions of its own.
    if (bytes[23] !== 0x9d || bytes[24] !== 0x01 || bytes[25] !== 0x2a) return null;
    const width = leUint16(view, 26);
    const height = leUint16(view, 28);
    if (width === null || height === null) return null;
    return validate(width & 0x3fff, height & 0x3fff);
  }

  return null;
}

/**
 * Read an image's intrinsic pixel dimensions from its header bytes.
 *
 * Returns `null` — never throws — for empty, truncated, corrupt or
 * unrecognised input, and for a header that parses cleanly but declares a
 * zero or negative dimension.
 */
export function readImageDimensions(bytes: Uint8Array): ImageDimensions | null {
  // The shortest header handled is GIF's, at 10 bytes.
  if (!bytes || bytes.length < 10) return null;

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  if (isPng(bytes)) return readPng(bytes, view);
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return readJpeg(bytes, view);
  if (matchesAscii(bytes, 0, 'GIF87a') || matchesAscii(bytes, 0, 'GIF89a')) return readGif(view);
  if (matchesAscii(bytes, 0, 'RIFF')) return readWebp(bytes, view);

  return null;
}
