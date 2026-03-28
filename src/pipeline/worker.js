// worker.js — Web Worker entry point for the image processing pipeline
// No framework imports.

import { processImage } from './index.js';

self.onmessage = function (event) {
  const { imageData, preset, mode, previewWidth, exportWidth } = event.data;
  try {
    const result = processImage(imageData, preset, { mode, previewWidth, exportWidth });
    // Transfer the underlying ArrayBuffer for zero-copy
    self.postMessage({ imageData: result }, [result.data.buffer]);
  } catch (err) {
    self.postMessage({ error: err instanceof Error ? err.message : String(err) });
  }
};
