// Minimal 1×2 JPEG with EXIF orientation=6 (90° CW), base64-encoded.
// Used to detect whether the browser auto-applies EXIF orientation.
const ORIENTATION_TEST_JPEG =
  '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8U' +
  'HRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgN' +
  'DRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIy' +
  'MjL/wAARCAABAAIDASIAAhEBAxEB/8QAFgABAQEAAAAAAAAAAAAAAAAABgUE/8QAIhAAAQQC' +
  'AgMAAAAAAAAAAAAAAQIDBAUREiExQf/EABQBAQAAAAAAAAAAAAAAAAAAAAD/xAAUEQEAAAAA' +
  'AAAAAAAAAAAAAP/aAAwDAQACEQMRAD8Aq2taz1FqO4htNPuZYYnFrpGNBa0n3wMDPuiIgD/Z';

let _autoRotates = null;

/**
 * Read the EXIF orientation tag from a JPEG Blob.
 * Reads only the first ~64KB of the blob (enough for EXIF header).
 * Returns 1 (normal) if no EXIF data found or not a JPEG.
 * @param {Blob} blob
 * @returns {Promise<number>}  EXIF orientation value 1–8
 */
export async function readOrientation(blob) {
  const slice = blob.slice(0, 65536);
  const buffer = await slice.arrayBuffer();
  const view = new DataView(buffer);
  const len = view.byteLength;

  // Must start with JPEG SOI marker 0xFFD8
  if (len < 2 || view.getUint16(0) !== 0xffd8) return 1;

  let offset = 2;
  while (offset + 4 <= len) {
    const marker = view.getUint16(offset);
    offset += 2;

    if (marker === 0xffe1) {
      // APP1 marker found
      const segLen = view.getUint16(offset);
      offset += 2;
      // Verify "Exif\0\0" signature
      if (offset + 6 > len) return 1;
      const sig =
        view.getUint8(offset) === 0x45 && // E
        view.getUint8(offset + 1) === 0x78 && // x
        view.getUint8(offset + 2) === 0x69 && // i
        view.getUint8(offset + 3) === 0x66 && // f
        view.getUint8(offset + 4) === 0x00 &&
        view.getUint8(offset + 5) === 0x00;
      if (!sig) return 1;

      const tiffStart = offset + 6;
      if (tiffStart + 8 > len) return 1;

      // Determine byte order: "II" = little-endian, "MM" = big-endian
      const byteOrder = view.getUint16(tiffStart);
      const littleEndian = byteOrder === 0x4949;

      // IFD0 offset from TIFF header start
      const ifd0Offset = tiffStart + view.getUint32(tiffStart + 4, littleEndian);
      if (ifd0Offset + 2 > len) return 1;

      const entryCount = view.getUint16(ifd0Offset, littleEndian);
      for (let i = 0; i < entryCount; i++) {
        const entryOffset = ifd0Offset + 2 + i * 12;
        if (entryOffset + 12 > len) break;
        const tag = view.getUint16(entryOffset, littleEndian);
        if (tag === 0x0112) {
          // Orientation tag — value is a SHORT (type 3)
          const value = view.getUint16(entryOffset + 8, littleEndian);
          return value >= 1 && value <= 8 ? value : 1;
        }
      }
      return 1;
    } else if ((marker & 0xff00) === 0xff00) {
      // Skip this segment
      if (offset + 2 > len) break;
      const segLen = view.getUint16(offset);
      offset += segLen;
    } else {
      break;
    }
  }
  return 1;
}

/**
 * Detect at startup whether the browser auto-applies EXIF orientation
 * when createImageBitmap is called. Result is cached for the session.
 * @returns {Promise<boolean>}
 */
export async function detectAutoRotation() {
  if (_autoRotates !== null) return _autoRotates;

  try {
    const binary = atob(ORIENTATION_TEST_JPEG.replace(/\s/g, ''));
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    const blob = new Blob([bytes], { type: 'image/jpeg' });
    const bitmap = await createImageBitmap(blob);
    // The test JPEG is 1×2 with orientation=6 (90° CW).
    // If the browser auto-rotated, the bitmap will be 2×1.
    _autoRotates = bitmap.width === 2 && bitmap.height === 1;
    bitmap.close?.();
  } catch {
    _autoRotates = false;
  }

  return _autoRotates;
}

/**
 * Apply canvas rotation/flip to correct for EXIF orientation.
 * Only called when the browser does NOT auto-apply EXIF orientation.
 * @param {ImageBitmap} bitmap
 * @param {number} orientation  EXIF orientation value 1–8
 * @returns {ImageData}
 */
export function applyOrientation(bitmap, orientation) {
  const sw = bitmap.width;
  const sh = bitmap.height;

  // For 90°/270° rotations, swap canvas dimensions
  const rotated = orientation >= 5 && orientation <= 8;
  const cw = rotated ? sh : sw;
  const ch = rotated ? sw : sh;

  const canvas = new OffscreenCanvas(cw, ch);
  const ctx = canvas.getContext('2d');

  ctx.save();

  switch (orientation) {
    case 1:
      // identity — no transform
      break;
    case 2:
      // flip horizontal
      ctx.translate(cw, 0);
      ctx.scale(-1, 1);
      break;
    case 3:
      // rotate 180°
      ctx.translate(cw, ch);
      ctx.rotate(Math.PI);
      break;
    case 4:
      // flip vertical
      ctx.translate(0, ch);
      ctx.scale(1, -1);
      break;
    case 5:
      // rotate 90° CW + flip horizontal
      ctx.rotate(Math.PI / 2);
      ctx.scale(1, -1);
      break;
    case 6:
      // rotate 90° CW
      ctx.translate(cw, 0);
      ctx.rotate(Math.PI / 2);
      break;
    case 7:
      // rotate 90° CCW + flip horizontal
      ctx.translate(cw, ch);
      ctx.rotate(Math.PI / 2);
      ctx.scale(-1, 1);
      break;
    case 8:
      // rotate 90° CCW
      ctx.translate(0, ch);
      ctx.rotate(-Math.PI / 2);
      break;
    default:
      break;
  }

  ctx.drawImage(bitmap, 0, 0);
  ctx.restore();

  return ctx.getImageData(0, 0, cw, ch);
}
