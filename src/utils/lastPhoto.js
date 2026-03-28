const STORAGE_KEY = 'grainframe_last_photo';

/**
 * Save a tiny thumbnail of the last processed photo.
 * Stored as a JPEG data URL in localStorage.
 * @param {ImageData} processedPreview
 */
export function saveLastPhoto(processedPreview) {
  try {
    const scale = 120 / Math.max(processedPreview.width, processedPreview.height);
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(processedPreview.width * scale);
    canvas.height = Math.round(processedPreview.height * scale);

    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = processedPreview.width;
    tempCanvas.height = processedPreview.height;
    tempCanvas.getContext('2d').putImageData(processedPreview, 0, 0);

    canvas.getContext('2d').drawImage(tempCanvas, 0, 0, canvas.width, canvas.height);
    localStorage.setItem(STORAGE_KEY, canvas.toDataURL('image/jpeg', 0.5));
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
