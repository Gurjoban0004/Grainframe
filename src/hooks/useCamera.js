import { useRef, useState, useEffect } from 'react';
import { loadAndResize } from '../utils/image.js';
import { ErrorTypes } from '../utils/errors.js';

function isOOMError(err) {
  return err instanceof RangeError ||
    err.message?.toLowerCase().includes('memory') ||
    err.message?.toLowerCase().includes('allocation');
}

/**
 * Manages camera capture and library import.
 * Stores the source Blob (not full-res ImageData) to save ~27MB of memory.
 * Full-res is decoded on-demand during export.
 */
export function useCamera({ onBatchSelect, onShutterDismiss } = {}) {
  const captureRef = useRef(null);
  const importRef = useRef(null);
  const isCapturingRef = useRef(false);
  const shutterTimeoutRef = useRef(null);

  const [previewImageData, setPreviewImageData] = useState(null);
  const [sourceBlob, setSourceBlob] = useState(null);
  const [error, setError] = useState(null);

  function triggerCapture() {
    isCapturingRef.current = true;
    captureRef.current?.click();
  }

  const triggerImport = () => importRef.current?.click();

  // Detect return from native camera
  useEffect(() => {
    function handleVisibilityChange() {
      if (!document.hidden && isCapturingRef.current) {
        if (import.meta.env.DEV) {
          console.log('App re-entered from camera, waiting for file...');
        }
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
    setSourceBlob(null);
    setError(null);

    try {
      // Load preview only — browser handles EXIF rotation automatically
      const previewImageData = await loadAndResize(file, 1024);
      setPreviewImageData(previewImageData);
      setSourceBlob(file); // store blob, not full-res ImageData (~27MB saved)
    } catch (err) {
      onShutterDismiss?.();
      if (isOOMError(err)) {
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
    sourceBlob,       // replaces fullImageData
    fullImageData: null, // kept for API compat — always null now
    error,
  };
}
