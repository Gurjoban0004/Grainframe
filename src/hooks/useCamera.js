import { useRef, useState, useEffect } from 'react';
import { loadImageDual, resizeToMax } from '../utils/image.js';
import { detectAutoRotation, readOrientation, applyOrientation } from '../utils/exif.js';
import { getMaxDimension } from '../utils/memory.js';
import { ErrorTypes } from '../utils/errors.js';

// Cache whether createImageBitmap supports imageOrientation option
let _bitmapOptionsCache;

async function getBitmapOptions() {
  if (_bitmapOptionsCache !== undefined) return _bitmapOptionsCache;
  try {
    // Test with a 1-byte PNG-like blob — will fail to decode but option support is what matters
    const testBlob = new Blob([new Uint8Array([137,80,78,71,13,10,26,10])], { type: 'image/png' });
    await createImageBitmap(testBlob, { imageOrientation: 'none' });
    _bitmapOptionsCache = { imageOrientation: 'none' };
  } catch {
    _bitmapOptionsCache = {};
  }
  return _bitmapOptionsCache;
}

function bitmapToImageData(bitmap) {
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  canvas.getContext('2d').drawImage(bitmap, 0, 0);
  return canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height);
}

/**
 * Manages camera capture and library import.
 * @param {{ onBatchSelect?: (files: File[]) => void, onShutterDismiss?: () => void }} [options]
 * @returns {{
 *   captureRef: React.RefObject,
 *   importRef: React.RefObject,
 *   handleFileChange: (event: Event) => void,
 *   triggerCapture: () => void,
 *   triggerImport: () => void,
 *   previewImageData: ImageData|null,
 *   fullImageData: ImageData|null,
 *   error: object|null,
 *   isCapturing: boolean
 * }}
 */
export function useCamera({ onBatchSelect, onShutterDismiss } = {}) {
  const captureRef = useRef(null);
  const importRef = useRef(null);
  const isCapturingRef = useRef(false);
  const shutterTimeoutRef = useRef(null);

  const [previewImageData, setPreviewImageData] = useState(null);
  const [fullImageData, setFullImageData] = useState(null);
  const [error, setError] = useState(null);

  function triggerCapture() {
    isCapturingRef.current = true;
    captureRef.current?.click();
  }

  const triggerImport = () => importRef.current?.click();

  // visibilitychange: detect return from native camera
  useEffect(() => {
    function handleVisibilityChange() {
      if (!document.hidden && isCapturingRef.current) {
        if (import.meta.env.DEV) {
          console.log('App re-entered from camera, waiting for file...');
        }
        // Safety: dismiss shutter after 5s if no file arrives
        shutterTimeoutRef.current = setTimeout(() => {
          isCapturingRef.current = false;
          onShutterDismiss?.();
        }, 5000);
      }
    }
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [onShutterDismiss]);

  async function handleFileChange(event) {
    clearTimeout(shutterTimeoutRef.current);
    isCapturingRef.current = false;

    const files = Array.from(event.target.files ?? []);
    if (files.length === 0) {
      onShutterDismiss?.();
      return;
    }

    // Multiple files → batch mode
    if (files.length > 1 && onBatchSelect) {
      onBatchSelect(files);
      event.target.value = '';
      return;
    }

    const file = files[0];

    setPreviewImageData(null);
    setFullImageData(null);
    setError(null);

    try {
      const bitmapOptions = await getBitmapOptions();

      // PARALLEL: read EXIF orientation + decode/resize images simultaneously
      const [
        orientation,
        { previewBitmap, fullBitmap, needsManualResize },
      ] = await Promise.all([
        readOrientation(file),
        loadImageDual(file, 1024, getMaxDimension(), bitmapOptions),
      ]);

      const autoRotates = await detectAutoRotation(); // cached after first call

      let previewImageData, fullImageData;

      if (!autoRotates && orientation !== 1) {
        previewImageData = applyOrientation(previewBitmap, orientation);
        fullImageData = applyOrientation(fullBitmap, orientation);
      } else {
        previewImageData = bitmapToImageData(previewBitmap);
        fullImageData = bitmapToImageData(fullBitmap);
      }

      previewBitmap.close?.();
      if (fullBitmap !== previewBitmap) fullBitmap.close?.();

      if (needsManualResize) {
        previewImageData = resizeToMax(previewImageData, 1024);
        fullImageData = resizeToMax(fullImageData, getMaxDimension());
      }

      setPreviewImageData(previewImageData);
      setFullImageData(fullImageData);
    } catch (err) {
      onShutterDismiss?.();
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
