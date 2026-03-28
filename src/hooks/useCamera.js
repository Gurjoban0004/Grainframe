import { useRef, useState } from 'react';
import { loadImage, resizeToMax } from '../utils/image.js';
import { detectAutoRotation, readOrientation, applyOrientation } from '../utils/exif.js';
import { getMaxDimension } from '../utils/memory.js';
import { ErrorTypes } from '../utils/errors.js';

/**
 * Manages camera capture and library import.
 * @returns {{
 *   captureRef: React.RefObject,
 *   importRef: React.RefObject,
 *   handleFileChange: (event: Event) => void,
 *   triggerCapture: () => void,
 *   triggerImport: () => void,
 *   previewImageData: ImageData|null,
 *   fullImageData: ImageData|null,
 *   error: object|null
 * }}
 */
export function useCamera() {
  const captureRef = useRef(null);
  const importRef = useRef(null);

  const [previewImageData, setPreviewImageData] = useState(null);
  const [fullImageData, setFullImageData] = useState(null);
  const [error, setError] = useState(null);

  const triggerCapture = () => captureRef.current?.click();
  const triggerImport = () => importRef.current?.click();

  async function handleFileChange(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    // Reset immediately — don't show stale image
    setPreviewImageData(null);
    setFullImageData(null);
    setError(null);

    try {
      const bitmap = await loadImage(file);

      const [autoRotates, orientation] = await Promise.all([
        detectAutoRotation(),
        readOrientation(file),
      ]);

      // Apply orientation correction only if the browser doesn't do it automatically
      const imageData = autoRotates
        ? applyOrientation(bitmap, 1) // identity — browser already rotated
        : applyOrientation(bitmap, orientation);

      bitmap.close?.();

      const preview = resizeToMax(imageData, 1024);
      const full = resizeToMax(imageData, getMaxDimension());

      setPreviewImageData(preview);
      setFullImageData(full);
    } catch (err) {
      if (
        err instanceof RangeError ||
        (err?.message && /memory|allocation/i.test(err.message))
      ) {
        setError(ErrorTypes.IMAGE_TOO_LARGE);
      } else {
        setError(ErrorTypes.IMAGE_LOAD_FAILED);
      }
    }
  }

  return {
    captureRef,
    importRef,
    handleFileChange,
    triggerCapture,
    triggerImport,
    previewImageData,
    fullImageData,
    error,
  };
}
