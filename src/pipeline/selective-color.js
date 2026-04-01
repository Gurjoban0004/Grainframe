/**
 * selective-color.js — Per-hue HSB adjustments with skin protection
 */

import { getAdjustmentScale, getSelectiveZoneAttenuationKey } from './skin.js';

const HUE_ZONES = [
  { name: 'red',     center: 0,   halfWidth: 30  },
  { name: 'orange',  center: 35,  halfWidth: 20  },
  { name: 'yellow',  center: 60,  halfWidth: 22  },
  { name: 'green',   center: 120, halfWidth: 45  },
  { name: 'cyan',    center: 180, halfWidth: 22  },
  { name: 'blue',    center: 230, halfWidth: 35  },
  { name: 'purple',  center: 280, halfWidth: 30  },
  { name: 'magenta', center: 330, halfWidth: 22  },
];

function zoneWeight(hue, zone) {
  let dist = Math.abs(hue - zone.center);
  if (dist > 180) dist = 360 - dist;
  if (dist >= zone.halfWidth) return 0;
  return (Math.cos((dist / zone.halfWidth) * Math.PI) + 1) * 0.5;
}

function hueToRgb(p, q, t) {
  if (t < 0) t += 1;
  if (t > 1) t -= 1;
  if (t < 1/6) return p + (q - p) * 6 * t;
  if (t < 1/2) return q;
  if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
  return p;
}

/**
 * Apply selective color adjustments with skin protection.
 *
 * @param {ImageData} imageData
 * @param {Object} adjustments - { red: {hueShift, satShift, lumShift}, ... }
 * @param {Float32Array|null} skinMask
 * @returns {ImageData}
 */
export function applySelectiveColor(imageData, adjustments, skinMask = null) {
  if (!adjustments) return imageData;

  // Quick bail if all adjustments are zero
  let hasAdjustment = false;
  for (const zone of HUE_ZONES) {
    const adj = adjustments[zone.name];
    if (adj && (Math.abs(adj.hueShift || 0) > 0.1 ||
                Math.abs(adj.satShift || 0) > 0.005 ||
                Math.abs(adj.lumShift || 0) > 0.005)) {
      hasAdjustment = true;
      break;
    }
  }
  if (!hasAdjustment) return imageData;

  // ── Precompute per-zone skin attenuation keys ──
  const zoneAttKeys = {};
  for (const zone of HUE_ZONES) {
    zoneAttKeys[zone.name] = getSelectiveZoneAttenuationKey(zone.name);
  }

  const data = imageData.data;

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i] / 255;
    const g = data[i + 1] / 255;
    const b = data[i + 2] / 255;

    // ── RGB → HSL ──
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const chroma = max - min;
    let h, s, l;

    l = (max + min) / 2;

    if (chroma < 0.001) continue; // achromatic — skip

    s = l > 0.5 ? chroma / (2 - max - min) : chroma / (max + min);

    if (max === r) h = ((g - b) / chroma) % 6;
    else if (max === g) h = (b - r) / chroma + 2;
    else h = (r - g) / chroma + 4;
    h *= 60;
    if (h < 0) h += 360;

    // ── Skin protection lookup ──
    const pixIdx = i / 4;
    const skinVal = skinMask ? skinMask[pixIdx] : 0;

    // ── Accumulate weighted adjustments ──
    let totalHueShift = 0;
    let totalSatMult = 1.0;
    let totalLumShift = 0;

    for (const zone of HUE_ZONES) {
      const w = zoneWeight(h, zone);
      if (w < 0.001) continue;

      const adj = adjustments[zone.name];
      if (!adj) continue;

      // Get skin attenuation for THIS specific zone
      const skinScale = skinVal > 0.01
        ? getAdjustmentScale(skinVal, zoneAttKeys[zone.name])
        : 1.0;

      totalHueShift += (adj.hueShift || 0) * w * skinScale;
      totalSatMult  += (adj.satShift || 0) * w * skinScale;
      totalLumShift += (adj.lumShift || 0) * w * skinScale;
    }

    // ── Apply ──
    let newH = ((h + totalHueShift) % 360 + 360) % 360;
    let newS = Math.max(0, Math.min(1, s * Math.max(0, totalSatMult)));
    let newL = Math.max(0, Math.min(1, l + totalLumShift));

    // ── HSL → RGB ──
    let newR, newG, newB;
    if (newS < 0.001) {
      newR = newG = newB = newL;
    } else {
      const q = newL < 0.5 ? newL * (1 + newS) : newL + newS - newL * newS;
      const p = 2 * newL - q;
      const hNorm = newH / 360;
      newR = hueToRgb(p, q, hNorm + 1/3);
      newG = hueToRgb(p, q, hNorm);
      newB = hueToRgb(p, q, hNorm - 1/3);
    }

    data[i]     = Math.max(0, Math.min(255, Math.round(newR * 255)));
    data[i + 1] = Math.max(0, Math.min(255, Math.round(newG * 255)));
    data[i + 2] = Math.max(0, Math.min(255, Math.round(newB * 255)));
  }

  return imageData;
}
