/**
 * Header-only image dimension reading.
 *
 * Every fixture below is built byte by byte rather than checked in as a
 * binary file: the whole point of the module under test is that it reads a
 * handful of header bytes and never looks at the pixels, so a hand-assembled
 * header with no image data at all is a *more* honest fixture than a real
 * photo — and it makes the offsets being asserted visible in the test.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert';

import { readImageDimensions } from '@shelvarr/services/comics/dimensions';

/** ASCII magic as bytes, without dragging in a TextEncoder. */
function ascii(text: string): number[] {
  return [...text].map((char) => char.charCodeAt(0));
}

function beUint16(value: number): number[] {
  return [(value >> 8) & 0xff, value & 0xff];
}

function beUint32(value: number): number[] {
  return [(value >>> 24) & 0xff, (value >>> 16) & 0xff, (value >>> 8) & 0xff, value & 0xff];
}

function leUint16(value: number): number[] {
  return [value & 0xff, (value >> 8) & 0xff];
}

function leUint24(value: number): number[] {
  return [value & 0xff, (value >> 8) & 0xff, (value >> 16) & 0xff];
}

/** A PNG up to and including the `IHDR` dimensions, plus a plausible tail. */
function png(width: number, height: number): Uint8Array {
  return new Uint8Array([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    ...beUint32(13),
    ...ascii('IHDR'),
    ...beUint32(width),
    ...beUint32(height),
    8, 6, 0, 0, 0, // bit depth, colour type, compression, filter, interlace
  ]);
}

/** A length-prefixed JPEG segment; `length` counts its own two bytes. */
function jpegSegment(marker: number, payload: number[]): number[] {
  return [0xff, marker, ...beUint16(payload.length + 2), ...payload];
}

/** A baseline SOF0 payload: precision, then height, then width. */
function sof0(width: number, height: number): number[] {
  return jpegSegment(0xc0, [8, ...beUint16(height), ...beUint16(width), 3]);
}

/** A JPEG whose SOF0 is preceded by whatever segments a caller supplies. */
function jpeg(width: number, height: number, preamble: number[] = []): Uint8Array {
  return new Uint8Array([0xff, 0xd8, ...preamble, ...sof0(width, height), 0xff, 0xd9]);
}

/** APP0/JFIF, a comment and a DQT — the usual furniture before a real SOF. */
const JFIF_APP0 = jpegSegment(0xe0, [...ascii('JFIF'), 0x00, 1, 1, 0, ...leUint16(1), ...leUint16(1), 0, 0]);
const COMMENT = jpegSegment(0xfe, ascii('scanned by nobody in particular'));
const DQT = jpegSegment(0xdb, [0x00, ...new Array(64).fill(0x10)]);

/** A define-Huffman-tables segment: `C4` sits inside the SOF marker range. */
const DHT = jpegSegment(0xc4, [0x00, ...new Array(16).fill(0x01), ...new Array(16).fill(0x00)]);

function gif(width: number, height: number): Uint8Array {
  return new Uint8Array([
    ...ascii('GIF89a'),
    ...leUint16(width),
    ...leUint16(height),
    0xf7, 0x00, 0x00, // packed fields, background colour index, aspect ratio
  ]);
}

/** Wrap a bitstream chunk in the RIFF/WEBP container. */
function riff(fourCC: string, payload: number[]): Uint8Array {
  return new Uint8Array([
    ...ascii('RIFF'),
    ...[payload.length + 12, 0, 0, 0],
    ...ascii('WEBP'),
    ...ascii(fourCC),
    ...[payload.length, 0, 0, 0],
    ...payload,
  ]);
}

/** Lossy WebP: frame tag, keyframe sync code, then 14-bit dimensions. */
function webpLossy(width: number, height: number): Uint8Array {
  return riff('VP8 ', [
    0x30, 0x01, 0x00, // frame tag (keyframe)
    0x9d, 0x01, 0x2a, // sync code
    ...leUint16(width),
    ...leUint16(height),
  ]);
}

/** Lossless WebP: signature byte, then width-1 and height-1 in 14 bits each. */
function webpLossless(width: number, height: number): Uint8Array {
  const bits = (width - 1) | ((height - 1) << 14);
  return riff('VP8L', [
    0x2f,
    bits & 0xff,
    (bits >>> 8) & 0xff,
    (bits >>> 16) & 0xff,
    (bits >>> 24) & 0xff,
  ]);
}

/** Extended WebP: flags, then 24-bit canvas width-1 and height-1. */
function webpExtended(width: number, height: number): Uint8Array {
  return riff('VP8X', [
    0x10, 0x00, 0x00, 0x00, // flags (alpha)
    ...leUint24(width - 1),
    ...leUint24(height - 1),
  ]);
}

describe('readImageDimensions', () => {
  describe('PNG', () => {
    it('reads width and height out of the IHDR chunk', () => {
      assert.deepStrictEqual(readImageDimensions(png(1988, 3056)), { width: 1988, height: 3056 });
    });

    it('reads an APNG, whose IHDR is identical', () => {
      // An animated PNG differs only in the chunks after IHDR, so appending
      // an acTL must not change the answer.
      const animated = new Uint8Array([
        ...png(640, 480),
        ...beUint32(8),
        ...ascii('acTL'),
        ...beUint32(12),
        ...beUint32(0),
      ]);
      assert.deepStrictEqual(readImageDimensions(animated), { width: 640, height: 480 });
    });

    it('returns null for a header truncated mid-dimension', () => {
      assert.strictEqual(readImageDimensions(png(800, 1200).slice(0, 18)), null);
    });

    it('returns null when the signature is right but IHDR is missing', () => {
      const noIhdr = png(800, 1200);
      noIhdr.set(ascii('IDAT'), 12);
      assert.strictEqual(readImageDimensions(noIhdr), null);
    });
  });

  describe('JPEG', () => {
    it('reads height and width from a bare SOF0', () => {
      assert.deepStrictEqual(readImageDimensions(jpeg(1200, 1800)), { width: 1200, height: 1800 });
    });

    it('walks past APP0, a comment and a DQT to find the SOF', () => {
      const bytes = jpeg(2400, 1500, [...JFIF_APP0, ...COMMENT, ...DQT]);
      assert.deepStrictEqual(readImageDimensions(bytes), { width: 2400, height: 1500 });
    });

    it('does not mistake a C4 (DHT) segment for a frame header', () => {
      // DHT shares the C0-CF range with the SOF family; read as a frame it
      // would report the nonsense packed into its table data instead.
      const bytes = jpeg(1024, 1536, [...JFIF_APP0, ...DHT]);
      assert.deepStrictEqual(readImageDimensions(bytes), { width: 1024, height: 1536 });
    });

    it('reads a progressive SOF2', () => {
      const bytes = new Uint8Array([
        0xff, 0xd8,
        ...JFIF_APP0,
        ...jpegSegment(0xc2, [8, ...beUint16(900), ...beUint16(600), 3]),
      ]);
      assert.deepStrictEqual(readImageDimensions(bytes), { width: 600, height: 900 });
    });

    it('tolerates FF fill bytes between segments', () => {
      const bytes = new Uint8Array([0xff, 0xd8, ...JFIF_APP0, 0xff, 0xff, 0xff, ...sof0(320, 200)]);
      assert.deepStrictEqual(readImageDimensions(bytes), { width: 320, height: 200 });
    });

    it('steps over standalone restart markers without reading a length', () => {
      const bytes = new Uint8Array([0xff, 0xd8, 0xff, 0xd0, 0xff, 0xd3, ...sof0(400, 700)]);
      assert.deepStrictEqual(readImageDimensions(bytes), { width: 400, height: 700 });
    });

    it('returns null when the SOF payload is truncated', () => {
      const bytes = jpeg(1200, 1800);
      assert.strictEqual(readImageDimensions(bytes.slice(0, bytes.length - 6)), null);
    });

    it('returns null when scan data starts before any frame header', () => {
      const bytes = new Uint8Array([0xff, 0xd8, ...JFIF_APP0, 0xff, 0xda, 0x00, 0x08, 1, 1, 0, 0, 0x3f, 0]);
      assert.strictEqual(readImageDimensions(bytes), null);
    });
  });

  describe('GIF', () => {
    it('reads the logical screen descriptor', () => {
      assert.deepStrictEqual(readImageDimensions(gif(500, 250)), { width: 500, height: 250 });
    });

    it('accepts the older GIF87a signature', () => {
      const bytes = gif(500, 250);
      bytes.set(ascii('GIF87a'), 0);
      assert.deepStrictEqual(readImageDimensions(bytes), { width: 500, height: 250 });
    });

    it('returns null for a header truncated mid-descriptor', () => {
      assert.strictEqual(readImageDimensions(gif(500, 250).slice(0, 7)), null);
    });
  });

  describe('WebP', () => {
    it('reads a lossy VP8 bitstream', () => {
      assert.deepStrictEqual(readImageDimensions(webpLossy(1600, 2400)), { width: 1600, height: 2400 });
    });

    it('reads a lossless VP8L bitstream', () => {
      assert.deepStrictEqual(readImageDimensions(webpLossless(1600, 2400)), { width: 1600, height: 2400 });
    });

    it('reads an extended VP8X canvas', () => {
      assert.deepStrictEqual(readImageDimensions(webpExtended(3200, 2000)), { width: 3200, height: 2000 });
    });

    it('reads the largest size VP8L can express', () => {
      // 14 bits of width-1, so 16384 is the ceiling; an off-by-one in the
      // mask or the +1 shows up here and nowhere else.
      assert.deepStrictEqual(readImageDimensions(webpLossless(16384, 16384)), {
        width: 16384,
        height: 16384,
      });
    });

    it('returns null when the VP8 keyframe sync code is missing', () => {
      const bytes = webpLossy(640, 480);
      bytes[24] = 0x00;
      assert.strictEqual(readImageDimensions(bytes), null);
    });

    it('returns null for each variant truncated mid-dimension', () => {
      assert.strictEqual(readImageDimensions(webpLossy(640, 480).slice(0, 27)), null);
      assert.strictEqual(readImageDimensions(webpLossless(640, 480).slice(0, 23)), null);
      assert.strictEqual(readImageDimensions(webpExtended(640, 480).slice(0, 28)), null);
    });

    it('returns null for a RIFF container that is not WebP', () => {
      const bytes = webpLossy(640, 480);
      bytes.set(ascii('WAVE'), 8);
      assert.strictEqual(readImageDimensions(bytes), null);
    });

    it('returns null for an unknown bitstream chunk', () => {
      const bytes = webpLossy(640, 480);
      bytes.set(ascii('VP9 '), 12);
      assert.strictEqual(readImageDimensions(bytes), null);
    });
  });

  describe('rubbish input', () => {
    it('returns null for an empty array', () => {
      assert.strictEqual(readImageDimensions(new Uint8Array(0)), null);
    });

    it('returns null for unrecognised magic bytes', () => {
      assert.strictEqual(readImageDimensions(new Uint8Array(ascii('not an image at all'))), null);
    });

    it('returns null for a run of zero bytes', () => {
      assert.strictEqual(readImageDimensions(new Uint8Array(64)), null);
    });

    it('returns null for a PNG declaring zero width', () => {
      assert.strictEqual(readImageDimensions(png(0, 1200)), null);
    });

    it('returns null for a JPEG declaring zero height', () => {
      assert.strictEqual(readImageDimensions(jpeg(1200, 0)), null);
    });

    it('returns null for a GIF declaring a zero-sized screen', () => {
      assert.strictEqual(readImageDimensions(gif(0, 0)), null);
    });

    it('reads correctly from a view into a larger buffer', () => {
      // Archive extractors hand back subarrays of a shared buffer, so the
      // parser must honour byteOffset rather than reading from the start.
      const padded = new Uint8Array(64 + png(300, 900).length);
      padded.set(png(300, 900), 64);
      assert.deepStrictEqual(readImageDimensions(padded.subarray(64)), { width: 300, height: 900 });
    });
  });
});
