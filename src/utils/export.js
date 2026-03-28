import { ErrorTypes } from './errors.js';

/**
 * Generate the export filename.
 * @param {string} presetId   e.g. "classic-chrome"
 * @param {number} [timestamp]  defaults to Date.now()
 * @returns {string}  "grainframe-{presetId}-{timestamp}.jpg"
 */
export function makeFilename(presetId, timestamp = Date.now()) {
  return `grainframe-${presetId}-${timestamp}.jpg`;
}

/**
 * Export a processed image blob.
 * Primary: navigator.share with File (iOS share sheet).
 * Fallback: <a download> with object URL.
 * @param {Blob} blob       JPEG blob at quality 0.92
 * @param {string} filename  e.g. "grainframe-classic-chrome-1718000000000.jpg"
 * @returns {Promise<void>}  Rejects with ErrorTypes.EXPORT_FAILED on failure
 */
export async function exportImage(blob, filename) {
  const file = new File([blob], filename, { type: 'image/jpeg' });
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: 'Grainframe' });
    } catch (err) {
      if (err.name !== 'AbortError') {
        throw ErrorTypes.EXPORT_FAILED;
      }
    }
  } else {
    try {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      if (
        err instanceof RangeError ||
        err.message?.toLowerCase().includes('memory') ||
        err.message?.toLowerCase().includes('allocation')
      ) {
        throw ErrorTypes.EXPORT_FAILED;
      }
      throw err;
    }
  }
}
