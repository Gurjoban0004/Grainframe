/**
 * useBatchProcessing — manages loading, previewing, and exporting multiple photos.
 *
 * Memory strategy:
 * - Only preview-resolution (1024px) ImageData is kept in memory during selection.
 * - Full-resolution images are loaded ONE AT A TIME during export, then released.
 * - Grid thumbnails are stored as data URL strings (not ImageData) to minimise heap.
 * - Maximum batch size: 20 photos.
 *
 * iOS download note:
 * - navigator.share() is NOT used for batch because it would pop up a share sheet
 *   for every individual photo. Instead we use <a download> links sequentially.
 * - On iOS Safari, download links save to Files → Downloads. A toast informs the user.
 * - A zip-based approach (JSZip + single share) would be better UX on iOS but adds
 *   bundle size. Deferred to a future iteration.
 */

import { useState } from 'react';
import { loadImageDual, resizeToMax } from '../utils/image.js';
import { detectAutoRotation, readOrientation, applyOrientation } from '../utils/exif.js';
import { getMaxDimension } from '../utils/memory.js';
import { makeFilename } from '../utils/export.js';
import { processImage } from '../pipeline/index.js';

export const MAX_BATCH = 20;

function imageDataToDataURL(imageData) {
  const canvas = document.createElement('canvas');
  canvas.width = imageData.width;
  canvas.height = imageData.height;
  canvas.getContext('2d').putImageData(imageData, 0, 0);
  return canvas.toDataURL('image/jpeg', 0.6);
}

async function loadOriented(file) {
  let bitmapOptions = {};
  try {
    const testBlob = new Blob([new Uint8Array([137,80,78,71])], { type: 'image/png' });
    await createImageBitmap(testBlob, { imageOrientation: 'none' });
    bitmapOptions = { imageOrientation: 'none' };
  } catch { /* not supported */ }

  const [orientation, { previewBitmap }] = await Promise.all([
    readOrientation(file),
    loadImageDual(file, 1024, 1024, bitmapOptions),
  ]);
  const autoRotates = await detectAutoRotation();

  let imageData;
  if (!autoRotates && orientation !== 1) {
    imageData = applyOrientation(previewBitmap, orientation);
  } else {
    const canvas = document.createElement('canvas');
    canvas.width = previewBitmap.width;
    canvas.height = previewBitmap.height;
    canvas.getContext('2d').drawImage(previewBitmap, 0, 0);
    imageData = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height);
  }
  previewBitmap.close?.();
  return imageData;
}

export function useBatchProcessing() {
  const [photos, setPhotos] = useState([]);
  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState({ current: 0, total: 0 });
  const [exportComplete, setExportComplete] = useState(false);

  async function loadBatch(files) {
    const filesToLoad = files.slice(0, MAX_BATCH);

    const entries = filesToLoad.map((file, i) => ({
      id: `batch-${Date.now()}-${i}`,
      file,
      preview: null,
      thumbnail: null,
      status: 'loading',
      error: null,
    }));

    setPhotos(entries);
    setExportComplete(false);

    // Load previews sequentially — not parallel (memory)
    for (let i = 0; i < entries.length; i++) {
      try {
        const oriented = await loadOriented(entries[i].file);
        const preview = resizeToMax(oriented, 1024);
        const tiny = resizeToMax(preview, 200);
        const thumbnail = imageDataToDataURL(tiny);

        setPhotos(prev => prev.map((p, j) =>
          j === i ? { ...p, preview, thumbnail, status: 'ready' } : p
        ));
      } catch (err) {
        setPhotos(prev => prev.map((p, j) =>
          j === i ? { ...p, status: 'error', error: err?.message ?? 'Load failed' } : p
        ));
      }
    }
  }

  async function regenerateThumbnails(currentPhotos, preset) {
    for (let i = 0; i < currentPhotos.length; i++) {
      const photo = currentPhotos[i];
      if (!photo.preview) continue;
      try {
        const tiny = resizeToMax(photo.preview, 200);
        const processed = processImage(tiny, preset, { mode: 'preview' });
        const thumbnail = imageDataToDataURL(processed);
        setPhotos(prev => prev.map((p, j) =>
          j === i ? { ...p, thumbnail } : p
        ));
      } catch {
        // Skip silently — thumbnail stays as-is
      }
    }
  }

  async function exportAll(preset) {
    setIsExporting(true);
    setExportComplete(false);

    const ready = photos.filter(p => p.status === 'ready');
    const total = ready.length;
    setExportProgress({ current: 0, total });

    let exported = 0;

    for (const photo of ready) {
      try {
        setPhotos(prev => prev.map(p =>
          p.id === photo.id ? { ...p, status: 'processing' } : p
        ));

        // Load full-res from original File — released when vars go out of scope
        const oriented = await loadOriented(photo.file);
        const fullImageData = resizeToMax(oriented, getMaxDimension());
        const processed = processImage(fullImageData, preset, { mode: 'export' });

        const canvas = document.createElement('canvas');
        canvas.width = processed.width;
        canvas.height = processed.height;
        canvas.getContext('2d').putImageData(processed, 0, 0);

        const blob = await new Promise((resolve, reject) =>
          canvas.toBlob(b => b ? resolve(b) : reject(new Error('toBlob returned null')), 'image/jpeg', 0.92)
        );

        const filename = makeFilename(preset.id, Date.now() + exported);
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        exported++;
        setExportProgress({ current: exported, total });
        setPhotos(prev => prev.map(p =>
          p.id === photo.id ? { ...p, status: 'exported' } : p
        ));
      } catch {
        exported++;
        setExportProgress({ current: exported, total });
        setPhotos(prev => prev.map(p =>
          p.id === photo.id ? { ...p, status: 'error', error: 'Export failed' } : p
        ));
      }
    }

    setIsExporting(false);
    setExportComplete(true);
  }

  function clearBatch() {
    setPhotos([]);
    setIsExporting(false);
    setExportProgress({ current: 0, total: 0 });
    setExportComplete(false);
  }

  return {
    photos,
    isExporting,
    exportProgress,
    exportComplete,
    loadBatch,
    regenerateThumbnails,
    exportAll,
    clearBatch,
  };
}
