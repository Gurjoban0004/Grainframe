// index.js — Pipeline orchestrator
// Executes all 5 stages in the correct order with correct color spaces.
// No framework imports.

import { applyColor }      from './color.js';
import { applyVignette }   from './vignette.js';
import { buildToneCurveLUTs, applyToneCurve } from './tonecurve.js';
import { applyGrain }      from './grain.js';
import { applySharpen }    from './sharpen.js';

/**
 * Process an ImageData through the full Grainframe pipeline.
 *
 * Color space flow:
 *   Input sRGB → [color transform in linear] → [vignette in linear]
 *   → [tone curve in sRGB] → [grain in sRGB] → [sharpen in sRGB] → Output sRGB
 *
 * @param {ImageData} imageData  Source pixels (not mutated; a copy is made)
 * @param {object}    preset     Preset configuration object
 * @param {object}    [options]  { mode: 'preview'|'export', previewWidth, exportWidth }
 * @returns {ImageData}
 */
export function processImage(imageData, preset, options = {}) {
  // Work on a copy so the original is not mutated
  const data = new Uint8ClampedArray(imageData.data);
  const out  = new ImageData(data, imageData.width, imageData.height);

  // Stage 1 — Color transform (linear light)
  applyColor(out, preset);

  // Stage 2 — Vignette (linear light)
  applyVignette(out, preset);

  // Stage 3 — Tone curve (sRGB)
  const luts = buildToneCurveLUTs(preset);
  applyToneCurve(out, luts);

  // Stage 4 — Film grain (sRGB)
  applyGrain(out, preset, options);

  // Stage 5 — Sharpen / unsharp mask (sRGB)
  applySharpen(out, preset);

  return out;
}
