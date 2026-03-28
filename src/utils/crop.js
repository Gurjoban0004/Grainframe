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

  const canvas = document.createElement('canvas');
  canvas.width = imageData.width;
  canvas.height = imageData.height;
  canvas.getContext('2d').putImageData(imageData, 0, 0);
  const result = canvas.getContext('2d').getImageData(sx, sy, sw, sh);
  canvas.width = 0;
  canvas.height = 0;
  return result;
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
