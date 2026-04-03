/**
 * skin.js — Skin Detection & Protection System
 *
 * Level 2: 3D HSL ellipsoid skin qualification
 * Level 3: Face detection mask integration
 *
 * Every processing function that can damage skin tones calls into
 * this module to get an attenuation factor per pixel.
 */

// ─── Skin Tone Ellipsoid Parameters ──────────────────────────────────────────
// Covers all human skin tones across all ethnicities.
// Derived from empirical studies of skin reflectance spectra.

const SKIN_HUE_CENTER = 26;      // degrees on HSL wheel
const SKIN_HUE_RANGE  = 16;      // ±16° → tighter restriction on reds and yellows
const SKIN_SAT_MIN    = 0.15;    // Higher to reject grayish wood
const SKIN_SAT_MAX    = 0.65;
const SKIN_SAT_CENTER = 0.35;
const SKIN_LUM_MIN    = 0.18;    // Higher to reject deep shadows/black jackets
const SKIN_LUM_MAX    = 0.88;
const SKIN_LUM_CENTER = 0.50;

// ─── Attenuation Factors ─────────────────────────────────────────────────────
// How much each adjustment type is reduced on skin.
// 0.0 = completely blocked on skin
// 1.0 = no protection (full adjustment applies to skin)
//
// These are tuned by testing against portraits with various edits.

export const SKIN_ATTENUATION = {
  // Tonal
  exposure:         0.85,
  highlights:       0.90,
  shadows:          0.70,
  brightness:       0.80,
  contrast:         0.55,
  blackPoint:       0.75,
  whitePoint:       0.90,

  // Color — these are the dangerous ones
  warmth:           0.40,
  greenShift:       0.08,   // almost completely blocked
  saturation:       0.65,
  vibrance:         0.25,

  // Selective color — zones that overlap skin
  selectiveRed:     0.25,
  selectiveOrange:  0.12,   // orange IS the skin zone — heavy protection
  selectiveYellow:  0.40,
  selectiveGreen:   1.00,
  selectiveCyan:    1.00,
  selectiveBlue:    1.00,
  selectivePurple:  1.00,
  selectiveMagenta: 0.85,

  // Texture
  clarityPositive:  0.00,   // positive clarity on skin = pores and wrinkles. Block it.
  clarityNegative:  0.65,   // negative clarity softens skin = usually desirable
  grain:            0.45,
  sharpen:          0.20,
};

// ─── Selective color zone name → attenuation key mapping ─────────────────────
const SELECTIVE_ZONE_ATTENUATION = {
  red:     'selectiveRed',
  orange:  'selectiveOrange',
  yellow:  'selectiveYellow',
  green:   'selectiveGreen',
  cyan:    'selectiveCyan',
  blue:    'selectiveBlue',
  purple:  'selectivePurple',
  magenta: 'selectiveMagenta',
};

/**
 * Get the attenuation key for a selective color zone.
 */
export function getSelectiveZoneAttenuationKey(zoneName) {
  return SELECTIVE_ZONE_ATTENUATION[zoneName] || 'selectiveGreen'; // default to no protection
}

// ─── Level 2: HSL Skin Qualification ─────────────────────────────────────────

/**
 * Compute skin likelihood for a pixel using 3D HSL ellipsoid + RGB ratio check.
 *
 * @param {number} r - 0 to 255
 * @param {number} g - 0 to 255
 * @param {number} b - 0 to 255
 * @returns {number} 0.0 (not skin) to 1.0 (definitely skin)
 */
export function skinWeight(r, g, b) {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;

  // ── Fast reject: RGB ratio check ──
  // Skin ALWAYS has R as the dominant or co-dominant channel.
  // If green or blue exceeds red by more than 5%, it's not skin.
  if (gn > rn * 1.05 || bn > rn * 1.05) return 0;

  // Also: skin has R > B always. If B >= R, reject.
  if (bn >= rn) return 0;

  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const chroma = max - min;

  // Near-achromatic pixels are not skin (gray/white/black)
  if (chroma < 0.05) return 0;

  // ── Compute HSL ──
  const l = (max + min) / 2;
  const s = l > 0.5 ? chroma / (2 - max - min) : chroma / (max + min);

  let h;
  if (max === rn) {
    h = ((gn - bn) / chroma);
    if (h < 0) h += 6;
  } else if (max === gn) {
    h = (bn - rn) / chroma + 2;
  } else {
    h = (rn - gn) / chroma + 4;
  }
  h *= 60; // convert to degrees

  // ── Range checks ──
  // Hue
  let hueDist = Math.abs(h - SKIN_HUE_CENTER);
  if (hueDist > 180) hueDist = 360 - hueDist;
  if (hueDist > SKIN_HUE_RANGE) return 0;

  // Saturation
  if (s < SKIN_SAT_MIN || s > SKIN_SAT_MAX) return 0;

  // Luminance
  if (l < SKIN_LUM_MIN || l > SKIN_LUM_MAX) return 0;

  // ── Smooth ellipsoid falloff ──
  // Distance from center of the skin volume, normalized 0–1
  const hueNorm = hueDist / SKIN_HUE_RANGE;
  const satRange = (SKIN_SAT_MAX - SKIN_SAT_MIN) / 2;
  const satNorm = Math.abs(s - SKIN_SAT_CENTER) / satRange;
  const lumRange = (SKIN_LUM_MAX - SKIN_LUM_MIN) / 2;
  const lumNorm = Math.abs(l - SKIN_LUM_CENTER) / lumRange;

  // Weighted ellipsoid distance
  // Hue is most discriminative, luminance least (skin can be very light or dark)
  const dist = Math.sqrt(
    hueNorm * hueNorm * 1.5 +
    satNorm * satNorm * 0.8 +
    lumNorm * lumNorm * 0.4
  );

  if (dist >= 1.0) return 0;

  // Cosine falloff — smooth, zero derivative at both ends
  return (Math.cos(dist * Math.PI) + 1) * 0.5;
}


// ─── Level 3: Face Mask Building ─────────────────────────────────────────────

/**
 * Build a complete skin protection mask for an image.
 * Combines HSL qualification (Level 2) with face detection (Level 3).
 *
 * @param {ImageData} imageData - ORIGINAL source pixels (not processed)
 * @param {Array|null} faceBoxes - from face detection:
 *   [{ x, y, width, height }, ...] in pixel coordinates
 * @returns {Float32Array} mask, width×height, 0.0–1.0
 */
export function buildSkinMask(imageData, faceBoxes = null) {
  const { data, width, height } = imageData;
  const mask = new Float32Array(width * height);

  // ── Pass 1: HSL qualification ──
  for (let i = 0; i < data.length; i += 4) {
    mask[i / 4] = skinWeight(data[i], data[i + 1], data[i + 2]);
  }

  // ── Pass 2: Face detection overlay ──
  if (faceBoxes && faceBoxes.length > 0) {
    const faceMask = buildFaceEllipses(width, height, faceBoxes);
    // Union: take maximum of HSL detection and face mask
    for (let i = 0; i < mask.length; i++) {
      mask[i] = Math.max(mask[i], faceMask[i]);
    }
  }

  // ── Pass 3: Light spatial smoothing ──
  // Removes noise in the HSL detection (isolated false positives)
  // and softens mask edges for seamless blending
  smoothMaskSeparable(mask, width, height, 2);

  return mask;
}

/**
 * Build soft elliptical masks from face bounding boxes.
 * Ellipses are expanded for neck/ears and have soft feathered edges.
 */
function buildFaceEllipses(width, height, faceBoxes) {
  const mask = new Float32Array(width * height);

  for (const face of faceBoxes) {
    // ── Expand bounding box ──
    // Faces are wider than the detection box (ears), and skin extends
    // below the chin (neck, chest).
    const expandX = face.width * 0.20;
    const expandUp = face.height * 0.10;
    const expandDown = face.height * 0.40; // much more expansion below for neck

    const cx = face.x + face.width / 2;
    const cy = face.y + face.height / 2 + (expandDown - expandUp) / 2;

    const rx = face.width / 2 + expandX;
    const ry = face.height / 2 + (expandUp + expandDown) / 2;

    // Feather: how far outside the ellipse the falloff extends
    const feather = Math.max(rx, ry) * 0.40;

    // Only iterate pixels in the affected region
    const x0 = Math.max(0, Math.floor(cx - rx - feather));
    const x1 = Math.min(width - 1, Math.ceil(cx + rx + feather));
    const y0 = Math.max(0, Math.floor(cy - ry - feather));
    const y1 = Math.min(height - 1, Math.ceil(cy + ry + feather));

    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        // Elliptical distance from face center
        const dx = (x - cx) / rx;
        const dy = (y - cy) / ry;
        const dist = Math.sqrt(dx * dx + dy * dy);

        let value;
        if (dist <= 1.0) {
          // Inside the ellipse — full protection
          value = 1.0;
        } else {
          // Outside — feathered falloff
          const outDist = (dist - 1.0) * Math.max(rx, ry) / feather;
          if (outDist >= 1.0) continue; // too far out
          value = (Math.cos(outDist * Math.PI) + 1) * 0.5;
        }

        const idx = y * width + x;
        mask[idx] = Math.max(mask[idx], value); // union of all faces
      }
    }
  }

  return mask;
}

/**
 * Separable box blur for mask smoothing.
 * Two passes (horizontal then vertical) for O(n×radius) instead of O(n×radius²).
 */
function smoothMaskSeparable(mask, width, height, radius) {
  const temp = new Float32Array(mask.length);

  // Horizontal pass
  for (let y = 0; y < height; y++) {
    const row = y * width;
    for (let x = 0; x < width; x++) {
      let sum = 0, count = 0;
      const lo = Math.max(0, x - radius);
      const hi = Math.min(width - 1, x + radius);
      for (let nx = lo; nx <= hi; nx++) {
        sum += mask[row + nx];
        count++;
      }
      temp[row + x] = sum / count;
    }
  }

  // Vertical pass
  for (let x = 0; x < width; x++) {
    for (let y = 0; y < height; y++) {
      let sum = 0, count = 0;
      const lo = Math.max(0, y - radius);
      const hi = Math.min(height - 1, y + radius);
      for (let ny = lo; ny <= hi; ny++) {
        sum += temp[ny * width + x];
        count++;
      }
      mask[y * width + x] = sum / count;
    }
  }
}


// ─── Adjustment Scaling ──────────────────────────────────────────────────────

/**
 * Get the scale factor for an adjustment at a given pixel.
 *
 * @param {number} maskValue - skin mask value at this pixel (0–1)
 * @param {string} adjustmentType - key into SKIN_ATTENUATION
 * @returns {number} 0.0 (fully protected) to 1.0 (no protection)
 *
 * Usage in processing code:
 *   const scale = getAdjustmentScale(mask[pixIdx], 'warmth');
 *   warmthShift = warmthShift * scale;
 */
export function getAdjustmentScale(maskValue, adjustmentType) {
  if (maskValue < 0.01) return 1.0; // fast path: not skin

  const attenuation = SKIN_ATTENUATION[adjustmentType];
  if (attenuation === undefined) return 1.0;

  // Blend: at maskValue=1 (definitely skin), scale = attenuation.
  //        at maskValue=0 (not skin),         scale = 1.0.
  return 1.0 - maskValue * (1.0 - attenuation);
}

/**
 * Convenience: get clarity scale (handles positive vs negative differently).
 */
export function getClarityScale(maskValue, clarityAmount) {
  if (maskValue < 0.01) return 1.0;
  const key = clarityAmount >= 0 ? 'clarityPositive' : 'clarityNegative';
  return getAdjustmentScale(maskValue, key);
}
