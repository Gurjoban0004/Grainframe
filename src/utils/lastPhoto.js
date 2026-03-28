const STORAGE_KEY = 'grainframe_last_photo';

/**
 * Save a tiny thumbnail of the last processed photo.
 * Stored as a JPEG data URL in localStorage.
 * @param {ImageData} processedPreview
 */
export function saveLastPhoto(processedPreview) {
  try {
    const scale = 120 / Math.max(processedPreview.width, processedPreview.height);
    const tw = Math.round(processedPreview.width * scale);
    const th = Math.round(processedPreview.height * scale);

    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = processedPreview.width;
    tempCanvas.height = processedPreview.height;
    tempCanvas.getContext('2d').putImageData(processedPreview, 0, 0);

    const canvas = document.createElement('canvas');
    canvas.width = tw;
    canvas.height = th;
    canvas.getContext('2d').drawImage(tempCanvas, 0, 0, tw, th);

    tempCanvas.width = 0;
    tempCanvas.height = 0;

    const dataUrl = canvas.toDataURL('image/jpeg', 0.5);
    canvas.width = 0;
    canvas.height = 0;

    localStorage.setItem(STORAGE_KEY, dataUrl);
  } catch {
    // localStorage full or unavailable — silently fail
  }
}

/**
 * Get the last photo thumbnail data URL.
 * @returns {string|null}
 */
export function getLastPhoto() {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}
