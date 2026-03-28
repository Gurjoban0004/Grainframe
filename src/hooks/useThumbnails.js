import { useState, useEffect } from 'react';
import { processImage } from '../pipeline/index.js';
import { resizeToMax } from '../utils/image.js';

export function useThumbnails(previewImageData, presets) {
  const [thumbnails, setThumbnails] = useState(new Map());
  const [isGenerating, setIsGenerating] = useState(false);

  useEffect(() => {
    if (!previewImageData) {
      setThumbnails(new Map());
      return;
    }

    let cancelled = false;

    async function generate() {
      setIsGenerating(true);
      setThumbnails(new Map());

      const tinyImageData = resizeToMax(previewImageData, 96);
      const map = new Map();

      for (const preset of presets) {
        if (cancelled) break;
        const clone = new ImageData(
          new Uint8ClampedArray(tinyImageData.data),
          tinyImageData.width,
          tinyImageData.height
        );
        try {
          const result = processImage(clone, preset, { mode: 'preview' });
          map.set(preset.id, result);
          // Update incrementally so cards fill in as they complete
          if (!cancelled) setThumbnails(new Map(map));
        } catch {
          // Skip failed thumbnails silently
        }
      }

      if (!cancelled) setIsGenerating(false);
    }

    generate();
    return () => { cancelled = true; };
  }, [previewImageData]); // eslint-disable-line react-hooks/exhaustive-deps

  return { thumbnails, isGenerating };
}
