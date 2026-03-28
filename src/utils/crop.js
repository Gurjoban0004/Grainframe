/**
 * Apply a crop rectangle to an ImageData.
 * @param {ImageData} imageData — source image
 * @param {Object} rect — { x, y, width, height } as fractions 0-1
 * @returns {ImageData} — cropped image
 */
export function applyCrop(imageData, rect) {
  const sx = Math.round(rect.x * imageData.width);
  const sy = Math.round(rect.y * imageData.height);
  const sw = Math.round(rect.width * imageData.width);
  const sh = Math.round(rect.height * imageData.height);

  const canvas = typeof OffscreenCanvas !== 'undefined'
    ? new OffscreenCanvas(imageData.width, imageData.height)
    : Object.assign(document.createElement('canvas'), { width: imageData.width, height: imageData.height });
  const ctx = canvas.getContext('2d');
  ctx.putImageData(imageData, 0, 0);
  return ctx.getImageData(sx, sy, sw, sh);
}

/**
 * Calculate a centered crop rect for a given aspect ratio.
 * @param {number} imageWidth
 * @param {number} imageHeight
 * @param {number} aspectW
 * @param {number} aspectH
 * @returns {{ x: number, y: number, width: number, height: number }} fractions 0-1
 */
export function calculateCropRect(imageWidth, imageHeight, aspectW, aspectH) {
  const imageAspect = imageWidth / imageHeight;
  const targetAspect = aspectW / aspectH;

  let cropWidth, cropHeight;
  if (imageAspect > targetAspect) {
    cropHeight = 1;
    cropWidth = targetAspect / imageAspect;
  } else {
    cropWidth = 1;
    cropHeight = imageAspect / targetAspect;
  }

  return {
    x: (1 - cropWidth) / 2,
    y: (1 - cropHeight) / 2,
    width: cropWidth,
    height: cropHeight,
  };
}
