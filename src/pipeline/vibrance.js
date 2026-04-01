/**
 * vibrance.js — Non-linear saturation with skin protection
 */

import { getAdjustmentScale } from './skin.js';

/**
 * Apply vibrance to imageData in-place.
 *
 * @param {ImageData} imageData
 * @param {number} vibrance - range: -1.0 to +1.0
 * @param {Float32Array|null} skinMask - precomputed skin mask, or null
 * @returns {ImageData}
 */
export function applyVibrance(imageData, vibrance, skinMask = null) {
  if (Math.abs(vibrance) < 0.001) return imageData;

  const data = imageData.data;

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i] / 255;
    const g = data[i + 1] / 255;
    const b = data[i + 2] / 255;

    // Perceptual luminance
    const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;

    // Fast saturation proxy
    const maxC = Math.max(r, g, b);
    const minC = Math.min(r, g, b);
    const chroma = maxC - minC;
    const sat = maxC > 0.001 ? chroma / maxC : 0;

    // Core vibrance weight: low saturation → more effect
    let weight = 1.0 - sat;
    weight = weight * weight; // smoother response curve

    // ── Skin protection ──
    const pixIdx = i / 4;
    const skinScale = skinMask
      ? getAdjustmentScale(skinMask[pixIdx], 'vibrance')
      : 1.0;

    // Apply
    const amount = vibrance * weight * skinScale;
    const scale = 1.0 + amount;

    data[i]     = Math.max(0, Math.min(255, Math.round((lum + (r - lum) * scale) * 255)));
    data[i + 1] = Math.max(0, Math.min(255, Math.round((lum + (g - lum) * scale) * 255)));
    data[i + 2] = Math.max(0, Math.min(255, Math.round((lum + (b - lum) * scale) * 255)));
  }

  return imageData;
}
