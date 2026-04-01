// sharpen.js — Unsharp mask in sRGB space
// No framework imports.

import { createCanvas, getContext } from './canvas-utils.js';
import { getAdjustmentScale } from './skin.js';

/**
 * Apply unsharp mask to ImageData in-place (sRGB space).
 * output = original + (original - blurred) * amount
 * @param {ImageData} imageData
 * @param {object} preset  { sharpenAmount }
 * @param {object} options { skinMask }
 */
export function applySharpen(imageData, preset, options = {}) {
  const MAX_AMOUNT = 0.3;
  const amount = Math.min(MAX_AMOUNT, Math.max(0, preset.sharpenAmount ?? 0));
  if (amount === 0) return;

  const { width, height } = imageData;
  const skinMask = options.skinMask || null;

  // Blur pass via ctx.filter
  const canvas = createCanvas(width, height);
  const ctx = getContext(canvas);
  ctx.putImageData(imageData, 0, 0);

  const blurCanvas = createCanvas(width, height);
  const blurCtx = getContext(blurCanvas);
  if (typeof blurCtx.filter !== 'undefined') {
    blurCtx.filter = 'blur(1px)';
  }
  blurCtx.drawImage(canvas, 0, 0);
  const blurred = blurCtx.getImageData(0, 0, width, height);

  const d  = imageData.data;
  const bd = blurred.data;

  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const idx = (y * width + x) * 4;
      const pixIdx = y * width + x;

      // Skin-aware sharpening
      const skinVal = skinMask ? skinMask[pixIdx] : 0;
      const sharpScale = skinVal > 0.01 ? getAdjustmentScale(skinVal, 'sharpen') : 1.0;
      const effAmount = amount * sharpScale;
      if (effAmount < 0.001) continue;

      for (let c = 0; c < 3; c++) {
        const center = d[idx + c];
        const bdCenter = bd[idx + c];

        // Unsharp mask
        const detail = center - bdCenter;
        d[idx + c] = Math.max(0, Math.min(255, Math.round(center + detail * effAmount * 4.0)));
      }
    }
  }
}
