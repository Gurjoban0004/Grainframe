import { useState, useRef } from 'react';
import { processImage } from '../pipeline/index.js';
import { createPipelineWorker } from '../pipeline/bridge.js';
import { useWorker } from './useWorker.js';
import { downscale } from '../utils/memory.js';
import { ErrorTypes } from '../utils/errors.js';

const PREVIEW_MAX_DIM = 1024;

/**
 * Clone an ImageData so the original buffer is not neutered on transfer.
 * @param {ImageData} imageData
 * @returns {ImageData}
 */
function cloneImageData(imageData) {
  return new ImageData(
    new Uint8ClampedArray(imageData.data),
    imageData.width,
    imageData.height
  );
}

/**
 * Returns true if the error is an out-of-memory / allocation error.
 * @param {unknown} err
 * @returns {boolean}
 */
function isOOMError(err) {
  if (err instanceof RangeError) return true;
  const msg = (err?.message ?? '').toLowerCase();
  return msg.includes('memory') || msg.includes('allocation');
}

/**
 * Manages the pipeline worker lifecycle and exposes process functions.
 * @returns {{
 *   preview: ImageData|null,
 *   isProcessing: boolean,
 *   error: object|null,
 *   processPreview: (imageData: ImageData, preset: object) => Promise<void>,
 *   processExport: (imageData: ImageData, preset: object) => Promise<ImageData>
 * }}
 */
export function useImagePipeline() {
  const [preview, setPreview] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState(null);

  const { worker } = useWorker(createPipelineWorker);

  // Monotonically-increasing request counter — guards against stale results
  const requestIdRef = useRef(0);

  /**
   * Process a preview image through the pipeline.
   * Clears the current preview immediately, then updates it when done.
   * Stale results (superseded by a newer call) are silently discarded.
   * @param {ImageData} imageData
   * @param {object} preset
   * @returns {Promise<void>}
   */
  async function processPreview(imageData, preset) {
    const myId = ++requestIdRef.current;
    setPreview(null);
    setIsProcessing(true);
    setError(null);

    try {
      const clone = cloneImageData(imageData);
      let result;

      const t0 = performance.now();
      if (worker) {
        result = await worker.process(clone, preset, { mode: 'preview', previewWidth: PREVIEW_MAX_DIM });
      } else {
        result = processImage(clone, preset, { mode: 'preview', previewWidth: PREVIEW_MAX_DIM });
      }
      const t1 = performance.now();
      if (import.meta.env.DEV) {
        console.log(`Pipeline preview: ${Math.round(t1 - t0)}ms`);
      }

      if (myId !== requestIdRef.current) return;
      setPreview(result);
    } catch (err) {
      if (myId !== requestIdRef.current) return;

      if (isOOMError(err)) {
        // OOM recovery: downscale to 50% and retry once
        try {
          const smaller = downscale(imageData, 0.5);
          const clone2 = cloneImageData(smaller);
          const t0r = performance.now();
          const result2 = worker
            ? await worker.process(clone2, preset, { mode: 'preview', previewWidth: PREVIEW_MAX_DIM })
            : processImage(clone2, preset, { mode: 'preview', previewWidth: PREVIEW_MAX_DIM });
          const t1r = performance.now();
          if (import.meta.env.DEV) {
            console.log(`Pipeline preview: ${Math.round(t1r - t0r)}ms`);
          }

          if (myId !== requestIdRef.current) return;
          setPreview(result2);
        } catch {
          if (myId !== requestIdRef.current) return;
          setError(ErrorTypes.PROCESSING_FAILED);
        }
      } else {
        setError(ErrorTypes.PROCESSING_FAILED);
      }
    } finally {
      if (myId === requestIdRef.current) {
        setIsProcessing(false);
      }
    }
  }

  /**
   * Process a full-resolution image for export.
   * @param {ImageData} imageData
   * @param {object} preset
   * @returns {Promise<ImageData>}
   */
  async function processExport(imageData, preset) {
    const clone = cloneImageData(imageData);

    const t0 = performance.now();
    let result;
    if (worker) {
      result = await worker.process(clone, preset, { mode: 'export', previewWidth: PREVIEW_MAX_DIM, exportWidth: imageData.width });
    } else {
      result = processImage(clone, preset, { mode: 'export', previewWidth: PREVIEW_MAX_DIM, exportWidth: imageData.width });
    }
    const t1 = performance.now();
    if (import.meta.env.DEV) {
      console.log(`Pipeline export: ${Math.round(t1 - t0)}ms`);
    }
    return result;
  }

  return { preview, setPreview, isProcessing, error, processPreview, processExport, worker };
}
