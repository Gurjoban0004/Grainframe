/**
 * clarity.js — Local contrast with skin protection
 *
 * Positive clarity on skin = every pore visible. We block it.
 * Negative clarity on skin = soft, flattering. We allow most of it.
 */

import { getClarityScale } from './skin.js';

/**
 * Apply clarity with per-pixel skin protection.
 *
 * @param {ImageData} imageData
 * @param {number} amount - -1.0 to +1.0
 * @param {Float32Array|null} skinMask
 * @param {number} radius - blur radius (default 50)
 * @returns {ImageData}
 */
export function applyClarity(imageData, amount, skinMask = null, radius = 50) {
  if (Math.abs(amount) < 0.005) return imageData;

  const { data, width, height } = imageData;

  // ── Build blurred version via downscale method ──
  const scale = 0.25;
  const blurW = Math.max(1, Math.round(width * scale));
  const blurH = Math.max(1, Math.round(height * scale));
  const blurRadius = Math.max(1, Math.round(radius * scale));

  const blurCanvas = document.createElement('canvas');
  blurCanvas.width = blurW;
  blurCanvas.height = blurH;
  const blurCtx = blurCanvas.getContext('2d');

  const tempCanvas = document.createElement('canvas');
  tempCanvas.width = width;
  tempCanvas.height = height;
  tempCanvas.getContext('2d').putImageData(imageData, 0, 0);

  blurCtx.drawImage(tempCanvas, 0, 0, blurW, blurH);
  blurCtx.filter = `blur(${blurRadius}px)`;
  blurCtx.drawImage(blurCanvas, 0, 0);
  blurCtx.filter = 'none';

  const fullBlurCanvas = document.createElement('canvas');
  fullBlurCanvas.width = width;
  fullBlurCanvas.height = height;
  const fullBlurCtx = fullBlurCanvas.getContext('2d');
  fullBlurCtx.drawImage(blurCanvas, 0, 0, width, height);
  const blurredData = fullBlurCtx.getImageData(0, 0, width, height).data;

  // ── Apply with skin protection ──
  for (let i = 0; i < data.length; i += 4) {
    const pixIdx = i / 4;

    // Per-pixel clarity scale based on skin mask
    let effectiveAmount = amount;
    if (skinMask && skinMask[pixIdx] > 0.01) {
      const clarityScale = getClarityScale(skinMask[pixIdx], amount);
      effectiveAmount = amount * clarityScale;

      // Bonus: if positive clarity is being applied globally but this is skin,
      // optionally apply slight NEGATIVE clarity for flattering softness
      if (amount > 0.1 && skinMask[pixIdx] > 0.5) {
        effectiveAmount = -0.08 * skinMask[pixIdx]; // gentle softening on skin
      }
    }

    if (Math.abs(effectiveAmount) < 0.005) continue; // skip this pixel

    const detailR = data[i]     - blurredData[i];
    const detailG = data[i + 1] - blurredData[i + 1];
    const detailB = data[i + 2] - blurredData[i + 2];

    const s = 1.0 + effectiveAmount;
    data[i]     = Math.max(0, Math.min(255, Math.round(blurredData[i]     + detailR * s)));
    data[i + 1] = Math.max(0, Math.min(255, Math.round(blurredData[i + 1] + detailG * s)));
    data[i + 2] = Math.max(0, Math.min(255, Math.round(blurredData[i + 2] + detailB * s)));
  }

  // Cleanup
  blurCanvas.remove();
  tempCanvas.remove();
  fullBlurCanvas.remove();

  return imageData;
}
