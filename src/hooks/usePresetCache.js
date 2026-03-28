import { useState, useRef, useCallback, useEffect } from 'react';

function getMaxCachedPresets() {
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
  return isIOS ? 4 : 8;
}

function getProcessingOrder(presets, activeIndex) {
  if (activeIndex < 0) return [...presets];
  const result = [];
  const visited = new Set();
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
 * Processes presets sequentially through the Web Worker (not main thread).
 *
 * @param {object[]} presets
 * @param {string} activePresetId
 * @param {ImageData|null} previewImageData
 * @param {object|null} workerBridge — { process, terminate } from createPipelineWorker
 */
export function usePresetCache(presets, activePresetId, previewImageData, workerBridge) {
  const [cache, setCache] = useState(new Map());
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState({ completed: 0, total: 0 });
  const cancelRef = useRef(0);
  const pauseRef = useRef(false);
  const currentImageRef = useRef(null);

  // Invalidate cache when source image changes
  useEffect(() => {
    if (previewImageData !== currentImageRef.current) {
      currentImageRef.current = previewImageData;
      cancelRef.current++;
      setCache(new Map());
      setProgress({ completed: 0, total: 0 });
      setIsProcessing(false);
    }
  }, [previewImageData]);

  const startBackgroundProcessing = useCallback(async (activeResult) => {
    if (!previewImageData || !workerBridge) return;

    const thisRun = ++cancelRef.current;
    pauseRef.current = false;

    const newCache = new Map();
    newCache.set(activePresetId, activeResult);
    setCache(new Map(newCache));

    const activeIndex = presets.findIndex(p => p.id === activePresetId);
    const ordered = getProcessingOrder(presets, activeIndex);
    const maxCached = getMaxCachedPresets();
    // -1 because active is already cached
    const presetsToProcess = ordered.slice(0, maxCached - 1);

    const total = presetsToProcess.length;
    setProgress({ completed: 0, total });
    setIsProcessing(true);

    let completed = 0;

    for (const preset of presetsToProcess) {
      if (cancelRef.current !== thisRun) {
        setIsProcessing(false);
        return;
      }

      if (newCache.has(preset.id)) {
        completed++;
        setProgress({ completed, total });
        continue;
      }

      // Wait while paused (user tapped a preset — let worker finish that first)
      while (pauseRef.current) {
        await new Promise(r => setTimeout(r, 50));
        if (cancelRef.current !== thisRun) {
          setIsProcessing(false);
          return;
        }
      }

      try {
        const clone = new ImageData(
          new Uint8ClampedArray(previewImageData.data),
          previewImageData.width,
          previewImageData.height
        );

        // Process in Web Worker — main thread stays free
        const result = await workerBridge.process(clone, preset, 'preview');

        if (cancelRef.current !== thisRun) {
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

      // Small yield to let React render the updated dot indicators
      await new Promise(r => setTimeout(r, 16));
    }

    setIsProcessing(false);
  }, [presets, activePresetId, previewImageData, workerBridge]);

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
    cancelRef.current++;
    setCache(new Map());
    setProgress({ completed: 0, total: 0 });
    setIsProcessing(false);
  }, []);

  const pause = useCallback(() => { pauseRef.current = true; }, []);
  const resume = useCallback(() => { pauseRef.current = false; }, []);

  return {
    cache,
    isBackgroundProcessing: isProcessing,
    getProcessedPreview,
    startBackgroundProcessing,
    invalidate,
    addToCache,
    progress,
    pause,
    resume,
  };
}
