import { useState, useRef } from 'react';
import { processImage, isWebGLActive } from '../pipeline/index.js';
import { createPipelineWorker } from '../pipeline/bridge.js';
import { useWorker } from './useWorker.js';
import { downscale } from '../utils/memory.js';
import { ErrorTypes } from '../utils/errors.js';

const PREVIEW_MAX_DIM = 1024;

function cloneImageData(imageData) {
  return new ImageData(
    new Uint8ClampedArray(imageData.data),
    imageData.width,
    imageData.height
  );
}

function isOOMError(err) {
  if (err instanceof RangeError) return true;
  const msg = (err?.message ?? '').toLowerCase();
  return msg.includes('memory') || msg.includes('allocation');
}

/**
 * Manages image processing via WebGL (main thread) or Canvas API (worker).
 * When WebGL is available, processImage runs directly on the main thread
 * in ~5-30ms — no worker needed. The worker is kept for Canvas fallback.
 */
export function useImagePipeline() {
  const [preview, setPreview] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState(null);

  // Worker is only used when WebGL is not available (Canvas fallback path)
  const { worker } = useWorker(createPipelineWorker);

  const requestIdRef = useRef(0);

  async function _runProcess(imageData, preset, options) {
    // WebGL path: call processImage directly on main thread (~5-30ms)
    // Canvas fallback path: use worker to avoid blocking main thread
    if (isWebGLActive()) {
      return processImage(imageData, preset, options);
    }
    if (worker) {
      return worker.process(imageData, preset, options);
    }
    return processImage(imageData, preset, options);
  }

  async function processPreview(imageData, preset) {
    const myId = ++requestIdRef.current;
    setPreview(null);
    setIsProcessing(true);
    setError(null);

    try {
      const clone = cloneImageData(imageData);
      const opts = { mode: 'preview', previewWidth: PREVIEW_MAX_DIM };

      const t0 = performance.now();
      const result = await _runProcess(clone, preset, opts);
      if (import.meta.env.DEV) {
        console.log(`Pipeline preview: ${Math.round(performance.now() - t0)}ms`);
      }

      if (myId !== requestIdRef.current) return;
      setPreview(result);
    } catch (err) {
      if (myId !== requestIdRef.current) return;

      if (isOOMError(err)) {
        try {
          const smaller = downscale(imageData, 0.5);
          const clone2 = cloneImageData(smaller);
          const opts = { mode: 'preview', previewWidth: PREVIEW_MAX_DIM };

          const t0r = performance.now();
          const result2 = await _runProcess(clone2, preset, opts);
          if (import.meta.env.DEV) {
            console.log(`Pipeline preview (OOM retry): ${Math.round(performance.now() - t0r)}ms`);
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

  async function processExport(imageData, preset) {
    const clone = cloneImageData(imageData);
    const opts = { mode: 'export', previewWidth: PREVIEW_MAX_DIM, exportWidth: imageData.width };

    const t0 = performance.now();
    const result = await _runProcess(clone, preset, opts);
    if (import.meta.env.DEV) {
      console.log(`Pipeline export: ${Math.round(performance.now() - t0)}ms`);
    }
    return result;
  }

  return { preview, setPreview, isProcessing, error, processPreview, processExport, worker };
}
