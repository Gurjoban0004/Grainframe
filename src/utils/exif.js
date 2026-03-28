// EXIF orientation is handled automatically by the browser.
// Safari 13.4+, Chrome 81+, Firefox 26+ all auto-apply EXIF
// orientation during createImageBitmap().
//
// These functions are kept as no-ops for any code that still references them.

export async function readOrientation() {
  return 1; // always "normal" — browser handles it
}

export function applyOrientation(bitmap) {
  // No-op — convert bitmap to ImageData, browser already rotated it
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  canvas.getContext('2d').drawImage(bitmap, 0, 0);
  const imageData = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height);
  canvas.width = 0;
  canvas.height = 0;
  return imageData;
}

export async function detectAutoRotation() {
  return true; // all target browsers auto-rotate
}
