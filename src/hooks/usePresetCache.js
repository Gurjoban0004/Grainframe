import { useState, useRef, useCallback, useEffect } from 'react';
import { processImage } from '../pipeline/index.js';

/**
 * Determine the order to process presets for maximum UX benefit.
 * Spirals outward from the active preset so adjacent presets are ready first.
 * @param {object[]} presets
 * @param {number} activeIndex
 * @returns {object[]}
 */
function getProcessingOrder(presets, activeIndex) {
  if (activeIndex < 0) return [...presets];
  const result = [];
  const visited = new Set([activeIndex]);
  for (let offset = 1; offset < presets.length; offset++) {
    const right = activeIndex + offset;
    if (right < presets.length && !visited.has(right)) {
      result.push(presets[right]);
      visited.add(right);
    }
    const left = activeIndex - offset;
    if (left >= 0 && !visited.has(left)) {
      result.push(presets[left]);
      visited.add(left);
    }
  }
  return result;
}

/**
 * Manages a cache of processed preview ImageData for all presets.
 * Processes presets sequentially in the background after the active preset is shown.
 *
 * @param {object[]} presets
 * @param {string} activePresetId
 * @param {ImageData|null} previewImageData
 */
export function usePresetCache(presets, activePresetId, previewImageData) {
  const [cache, setCache] = useState(new Map());
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState({ completed: 0, total: 0 });
  const cancelRef = useRef(false);
  const currentImageRef = useRef(null);

  // Invalidate cache when source image changes
  useEffect(() => {
    if (previewImageData !== currentImageRef.current) {
      currentImageRef.current = previewImageData;
      cancelRef.current = true;
      setCache(new Map());
      setProgress({ completed: 0, total: 0 });
      setIsProcessing(false);
    }
  }, [previewImageData]);

  /**
   * Start background processing of all non-active presets.
   * Seeds the cache with the already-processed active result.
   * @param {ImageData} activeResult — the already-processed preview for activePresetId
   */
  const startBackgroundProcessing = useCallback(async (activeResult) => {
    if (!previewImageData) return;

    // Cancel any previous run and wait a tick for it to observe the flag
    cancelRef.current = true;
    await new Promise(r => setTimeout(r, 0));
    cancelRef.current = false;

    const activeIndex = presets.findIndex(p => p.id === activePresetId);
    const ordered = getProcessingOrder(presets, activeIndex);
    const total = ordered.length;

    // Seed with active result
    const newCache = new Map();
    newCache.set(activePresetId, activeResult);
    setCache(new Map(newCache));
    setProgress({ completed: 0, total });
    setIsProcessing(true);

    let completed = 0;

    for (const preset of ordered) {
      if (cancelRef.current) {
        setIsProcessing(false);
        return;
      }

      if (newCache.has(preset.id)) {
        completed++;
        setProgress({ completed, total });
        continue;
      }

      try {
        const clone = new ImageData(
          new Uint8ClampedArray(previewImageData.data),
          previewImageData.width,
          previewImageData.height
        );

        const result = processImage(clone, preset, { mode: 'preview' });

        if (cancelRef.current) {
          setIsProcessing(false);
          return;
        }

        newCache.set(preset.id, result);
        setCache(new Map(newCache));
      } catch (err) {
        if (import.meta.env.DEV) {
          console.warn(`Background processing failed for ${preset.id}:`, err);
        }
      }

      completed++;
      setProgress({ completed, total });

      // Yield to main thread between presets to keep UI responsive
      await new Promise(r => setTimeout(r, 0));
    }

    setIsProcessing(false);
  }, [presets, activePresetId, previewImageData]);

  const getProcessedPreview = useCallback((presetId) => {
    return cache.get(presetId) ?? null;
  }, [cache]);

  const addToCache = useCallback((presetId, imageData) => {
    setCache(prev => {
      const next = new Map(prev);
      next.set(presetId, imageData);
      return next;
    });
  }, []);

  const invalidate = useCallback(() => {
    cancelRef.current = true;
    setCache(new Map());
    setProgress({ completed: 0, total: 0 });
    setIsProcessing(false);
  }, []);

  return {
    cache,
    isBackgroundProcessing: isProcessing,
    getProcessedPreview,
    startBackgroundProcessing,
    addToCache,
    invalidate,
    progress,
  };
}
