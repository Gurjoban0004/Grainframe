/**
 * tonal.js — Exposure, Highlights, Shadows, Brightness, Contrast,
 *            Black Point, White Point — with skin protection
 *
 * Uses dual-LUT approach: builds a full-effect LUT and a skin-safe LUT,
 * then blends per pixel based on the skin mask.
 */

import { SKIN_ATTENUATION } from './skin.js';

function smoothstep(edge0, edge1, x) {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/**
 * Build a 256-entry tonal LUT from parameters.
 * Extracted so we can build two LUTs (full and attenuated) efficiently.
 */
function buildTonalLUT(params) {
  const {
    exposure = 0,
    brightness = 0,
    contrast = 0,
    highlights = 0,
    shadows = 0,
    blackPoint = 0,
    whitePoint = 1.0
  } = params;

  const lut = new Uint8Array(256);

  for (let i = 0; i < 256; i++) {
    let v = i / 255;

    // 1. Exposure
    if (Math.abs(exposure) > 0.01) {
      const gain = Math.pow(2, exposure);
      v = v * gain;
      if (v > 1.0) {
        v = 1.0 - 0.3 * Math.exp(-(v - 1.0) * 2.0);
      }
    }

    // 2. Black point
    if (blackPoint > 0.005) {
      v = blackPoint + v * (1.0 - blackPoint);
    }

    // 3. White point
    if (whitePoint < 0.995) {
      v = v * whitePoint;
    }

    // 4. Highlights
    if (Math.abs(highlights) > 0.01) {
      const hw = smoothstep(0.3, 0.7, v);
      if (highlights < 0) {
        v = v - hw * Math.abs(highlights) * (v - 0.5) * 0.8;
      } else {
        v = v + hw * highlights * (1.0 - v) * 0.6;
      }
    }

    // 5. Shadows
    if (Math.abs(shadows) > 0.01) {
      const sw = 1.0 - smoothstep(0.3, 0.7, v);
      if (shadows > 0) {
        v = v + sw * shadows * (0.5 - v) * 0.8;
      } else {
        v = v + sw * shadows * v * 0.6;
      }
    }

    // 6. Brightness
    if (Math.abs(brightness) > 0.01) {
      const midW = Math.exp(-Math.pow((v - 0.5) / 0.3, 2));
      v = v + brightness * midW * 0.3;
    }

    // 7. Contrast
    if (Math.abs(contrast) > 0.01) {
      const centered = v - 0.5;
      if (contrast > 0) {
        const k = 1.0 + contrast * 3.0;
        v = 0.5 + centered * k / (1.0 + Math.abs(centered) * (k - 1) * 2);
      } else {
        v = 0.5 + centered * (1.0 + contrast * 0.8);
      }
    }

    lut[i] = Math.max(0, Math.min(255, Math.round(v * 255)));
  }

  return lut;
}

/**
 * Apply tonal adjustments with skin protection.
 *
 * @param {ImageData} imageData
 * @param {Object} tonal - { exposure, brightness, contrast, highlights, shadows, blackPoint, whitePoint }
 * @param {Float32Array|null} skinMask
 * @returns {ImageData}
 */
export function applyTonalAdjustments(imageData, tonal, skinMask = null) {
  const {
    exposure = 0, brightness = 0, contrast = 0,
    highlights = 0, shadows = 0,
    blackPoint = 0, whitePoint = 1.0
  } = tonal;

  // Quick bail if everything is neutral
  if (Math.abs(exposure) < 0.01 && Math.abs(brightness) < 0.01 &&
      Math.abs(contrast) < 0.01 && Math.abs(highlights) < 0.01 &&
      Math.abs(shadows) < 0.01 && blackPoint < 0.005 && whitePoint > 0.995) {
    return imageData;
  }

  // ── Build full-effect LUT ──
  const fullLut = buildTonalLUT(tonal);

  // ── Build skin-attenuated LUT ──
  // Each parameter is scaled by its skin attenuation factor
  const skinTonal = {
    exposure:   exposure   * SKIN_ATTENUATION.exposure,
    brightness: brightness * SKIN_ATTENUATION.brightness,
    contrast:   contrast   * SKIN_ATTENUATION.contrast,
    highlights: highlights * SKIN_ATTENUATION.highlights,
    shadows:    shadows    * SKIN_ATTENUATION.shadows,
    blackPoint: blackPoint * SKIN_ATTENUATION.blackPoint,
    whitePoint: 1.0 - (1.0 - whitePoint) * SKIN_ATTENUATION.whitePoint,
  };
  const skinLut = (skinMask) ? buildTonalLUT(skinTonal) : null;

  // ── Apply ──
  const data = imageData.data;

  if (!skinMask || !skinLut) {
    // No skin mask — fast path, single LUT
    for (let i = 0; i < data.length; i += 4) {
      data[i]     = fullLut[data[i]];
      data[i + 1] = fullLut[data[i + 1]];
      data[i + 2] = fullLut[data[i + 2]];
    }
  } else {
    // Skin-aware — blend between full and skin LUT per pixel
    for (let i = 0; i < data.length; i += 4) {
      const pixIdx = i / 4;
      const protection = skinMask[pixIdx];

      if (protection < 0.01) {
        // Fast path: not skin
        data[i]     = fullLut[data[i]];
        data[i + 1] = fullLut[data[i + 1]];
        data[i + 2] = fullLut[data[i + 2]];
      } else if (protection > 0.99) {
        // Fast path: definitely skin
        data[i]     = skinLut[data[i]];
        data[i + 1] = skinLut[data[i + 1]];
        data[i + 2] = skinLut[data[i + 2]];
      } else {
        // Blend
        const inv = 1 - protection;
        data[i]     = Math.round(fullLut[data[i]]     * inv + skinLut[data[i]]     * protection);
        data[i + 1] = Math.round(fullLut[data[i + 1]] * inv + skinLut[data[i + 1]] * protection);
        data[i + 2] = Math.round(fullLut[data[i + 2]] * inv + skinLut[data[i + 2]] * protection);
      }
    }
  }

  return imageData;
}
