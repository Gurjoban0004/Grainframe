import { ErrorTypes } from './errors.js';

/**
 * Load a Blob into an ImageBitmap.
 * Tries createImageBitmap with imageOrientation:'none' first (Chrome/Firefox).
 * Falls back to plain createImageBitmap (Safari, which ignores the option but
 * applies its own EXIF orientation — detectAutoRotation() tells us which path ran).
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
