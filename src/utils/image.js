import { ErrorTypes } from './errors.js';

/**
 * Read image dimensions from file header without full decode.
 * Works for JPEG and PNG. Falls back to createImageBitmap for other formats.
 * @param {Blob} blob
 * @returns {Promise<{width: number, height: number}>}
 */
export async function readImageDimensions(blob) {
  const header = await blob.slice(0, 65536).arrayBuffer();
  const view = new DataView(header);

  // JPEG
  if (view.getUint16(0) === 0xffd8) {
    try {
      return readJpegDimensions(view);
    } catch {
      // fall through to bitmap fallback
    }
  }

  // PNG
  if (view.byteLength >= 24 && view.getUint32(0) === 0x89504e47) {
    return {
      width: view.getUint32(16),
      height: view.getUint32(20),
    };
  }

  // Fallback: quick decode (needed for HEIC and other formats)
  const bitmap = await createImageBitmap(blob);
  const dims = { width: bitmap.width, height: bitmap.height };
  bitmap.close();
  return dims;
}

function readJpegDimensions(view) {
  let offset = 2;
  while (offset + 4 <= view.byteLength) {
    if (view.getUint8(offset) !== 0xff) break;
    const marker = view.getUint8(offset + 1);

    // SOF markers contain dimensions (exclude DHT=C4, JPG=C8, DAC=CC)
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      return {
        height: view.getUint16(offset + 5),
        width: view.getUint16(offset + 7),
      };
    }

    const segmentLength = view.getUint16(offset + 2);
    offset += 2 + segmentLength;
  }
  throw new Error('Could not read JPEG dimensions');
}

/**
 * Load a blob and create two ImageBitmaps in parallel:
 * one at preview resolution, one at full/ceiling resolution.
 * Uses createImageBitmap resize options for maximum speed.
 * @param {Blob} blob
 * @param {number} previewMax
 * @param {number} fullMax
 * @param {object} bitmapOptions  e.g. { imageOrientation: 'none' }
 * @returns {Promise<{ previewBitmap: ImageBitmap, fullBitmap: ImageBitmap, naturalWidth: number, naturalHeight: number, needsManualResize?: boolean }>}
 */
export async function loadImageDual(blob, previewMax, fullMax, bitmapOptions = {}) {
  const { width: natW, height: natH } = await readImageDimensions(blob);

  const previewScale = Math.min(1, previewMax / Math.max(natW, natH));
  const fullScale = Math.min(1, fullMax / Math.max(natW, natH));

  const previewW = Math.round(natW * previewScale);
  const previewH = Math.round(natH * previewScale);
  const fullW = Math.round(natW * fullScale);
  const fullH = Math.round(natH * fullScale);

  try {
    const [previewBitmap, fullBitmap] = await Promise.all([
      createImageBitmap(blob, { ...bitmapOptions, resizeWidth: previewW, resizeHeight: previewH, resizeQuality: 'medium' }),
      createImageBitmap(blob, { ...bitmapOptions, resizeWidth: fullW, resizeHeight: fullH, resizeQuality: 'high' }),
    ]);
    return { previewBitmap, fullBitmap, naturalWidth: natW, naturalHeight: natH };
  } catch {
    // Fallback: resize options not supported
    const bitmap = await createImageBitmap(blob, bitmapOptions);
    return { previewBitmap: bitmap, fullBitmap: bitmap, naturalWidth: natW, naturalHeight: natH, needsManualResize: true };
  }
}

/**
 * Scale an ImageData proportionally so neither dimension exceeds maxDimension.
 * Returns the original ImageData unchanged if already within bounds.
 * @param {ImageData} imageData
 * @param {number} maxDimension
 * @returns {ImageData}
 */
export function resizeToMax(imageData, maxDimension) {
  const { width: w, height: h } = imageData;
  const scale = maxDimension / Math.max(w, h);
  if (scale >= 1) return imageData;

  const newW = Math.floor(w * scale);
  const newH = Math.floor(h * scale);

  try {
    const src = typeof OffscreenCanvas !== 'undefined'
      ? new OffscreenCanvas(w, h)
      : Object.assign(document.createElement('canvas'), { width: w, height: h });
    src.getContext('2d').putImageData(imageData, 0, 0);

    const dst = typeof OffscreenCanvas !== 'undefined'
      ? new OffscreenCanvas(newW, newH)
      : Object.assign(document.createElement('canvas'), { width: newW, height: newH });
    const ctx = dst.getContext('2d');
    ctx.drawImage(src, 0, 0, newW, newH);

    return ctx.getImageData(0, 0, newW, newH);
  } catch (err) {
    if (
      err instanceof RangeError ||
      err.message?.toLowerCase().includes('memory') ||
      err.message?.toLowerCase().includes('allocation')
    ) {
      throw ErrorTypes.IMAGE_TOO_LARGE;
    }
    throw err;
  }
}
