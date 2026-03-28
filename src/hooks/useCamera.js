import { useRef, useState } from 'react';
import { loadImage, resizeToMax } from '../utils/image.js';
import { detectAutoRotation, readOrientation, applyOrientation } from '../utils/exif.js';
import { getMaxDimension } from '../utils/memory.js';
import { ErrorTypes } from '../utils/errors.js';

/**
 * Manages camera capture and library import.
 * @param {{ onBatchSelect?: (files: File[]) => void }} [options]
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
export function useCamera({ onBatchSelect } = {}) {
  const captureRef = useRef(null);
  const importRef = useRef(null);

  const [previewImageData, setPreviewImageData] = useState(null);
  const [fullImageData, setFullImageData] = useState(null);
  const [error, setError] = useState(null);

  const triggerCapture = () => captureRef.current?.click();
  const triggerImport = () => importRef.current?.click();

  async function handleFileChange(event) {
    const files = Array.from(event.target.files ?? []);
    if (files.length === 0) return;

    // Multiple files → batch mode
    if (files.length > 1 && onBatchSelect) {
      onBatchSelect(files);
      // Reset the input so the same selection can be re-triggered
      event.target.value = '';
      return;
    }

    const file = files[0];

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

      // If the browser auto-rotates (Safari), skip manual correction.
      // If it doesn't (Chrome with imageOrientation:none), apply it ourselves.
      const imageData = autoRotates
        ? applyOrientation(bitmap, 1)
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
