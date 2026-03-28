import { ErrorTypes } from './errors.js';

/**
 * Load an image blob and return ImageData at the specified max dimension.
 * Browser automatically handles EXIF orientation.
 * @param {Blob} blob
 * @param {number} maxDimension
 * @returns {Promise<ImageData>}
 */
export async function loadAndResize(blob, maxDimension) {
  const bitmap = await createImageBitmap(blob);

  const { width: natW, height: natH } = bitmap;
  const scale = Math.min(1, maxDimension / Math.max(natW, natH));
  const targetW = Math.round(natW * scale);
  const targetH = Math.round(natH * scale);

  const canvas = document.createElement('canvas');
  canvas.width = targetW;
  canvas.height = targetH;
  canvas.getContext('2d').drawImage(bitmap, 0, 0, targetW, targetH);
  bitmap.close();

  const imageData = canvas.getContext('2d').getImageData(0, 0, targetW, targetH);
  canvas.width = 0;
  canvas.height = 0;
  return imageData;
}

/**
 * Resize an existing ImageData to fit within maxDimension.
 * Returns the original if already within bounds.
 * @param {ImageData} imageData
 * @param {number} maxDimension
 * @returns {ImageData}
 */
export function resizeToMax(imageData, maxDimension) {
  const { width, height } = imageData;
  if (Math.max(width, height) <= maxDimension) return imageData;

  const scale = maxDimension / Math.max(width, height);
  const targetW = Math.round(width * scale);
  const targetH = Math.round(height * scale);

  try {
    const src = document.createElement('canvas');
    src.width = width;
    src.height = height;
    src.getContext('2d').putImageData(imageData, 0, 0);

    const dst = document.createElement('canvas');
    dst.width = targetW;
    dst.height = targetH;
    dst.getContext('2d').drawImage(src, 0, 0, targetW, targetH);

    const result = dst.getContext('2d').getImageData(0, 0, targetW, targetH);
    src.width = 0; src.height = 0;
    dst.width = 0; dst.height = 0;
    return result;
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
