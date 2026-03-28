import { ErrorTypes } from './errors.js';

/**
 * Load a Blob into an ImageBitmap.
 * Attempts createImageBitmap with { imageOrientation: 'none' } first.
 * Falls back to createImageBitmap without options if that throws.
 * @param {Blob} blob
 * @returns {Promise<ImageBitmap>}
 */
export async function loadImage(blob) {
  try {
    return await createImageBitmap(blob, { imageOrientation: 'none' });
  } catch {
    return createImageBitmap(blob);
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
    const src = new OffscreenCanvas(w, h);
    src.getContext('2d').putImageData(imageData, 0, 0);

    const dst = new OffscreenCanvas(newW, newH);
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
