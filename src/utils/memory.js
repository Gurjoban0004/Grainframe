/**
 * Returns the maximum image dimension for the current platform.
 * @returns {number} 3000 on iOS, 4000 elsewhere
 */
export function getMaxDimension() {
  return isIOS() ? 3000 : 4000;
}

/**
 * Downscale an ImageData by a factor.
 * @param {ImageData} imageData
 * @param {number} factor  e.g. 0.5 to halve both dimensions
 * @returns {ImageData}
 */
export function downscale(imageData, factor) {
  const srcW = imageData.width;
  const srcH = imageData.height;
  const dstW = Math.floor(srcW * factor);
  const dstH = Math.floor(srcH * factor);

  // Draw source ImageData onto a temp canvas, then scale-draw onto destination canvas
  const srcCanvas = createFallbackCanvas(srcW, srcH);
  const srcCtx = srcCanvas.getContext('2d');
  srcCtx.putImageData(imageData, 0, 0);

  const dstCanvas = createFallbackCanvas(dstW, dstH);
  const dstCtx = dstCanvas.getContext('2d');
  dstCtx.drawImage(srcCanvas, 0, 0, dstW, dstH);

  return dstCtx.getImageData(0, 0, dstW, dstH);
}

function createFallbackCanvas(width, height) {
  if (typeof OffscreenCanvas !== 'undefined') {
    return new OffscreenCanvas(width, height);
  }
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

function isIOS() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
}
