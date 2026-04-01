// index.js — Pipeline orchestrator
// Tries WebGL first; falls back to Canvas API pipeline automatically.

import { WebGLRenderer } from './webgl/renderer.js';

// Canvas API pipeline imports (fallback path — unchanged)
import { applyColor }      from './color.js';
import { applyTonalAdjustments } from './tonal.js';
import { applyVignette }   from './vignette.js';
import { applyVibrance }   from './vibrance.js';
import { applySelectiveColor } from './selective-color.js';
import { applyClarity }    from './clarity.js';
import { buildToneCurveLUTs, applyToneCurve } from './tonecurve.js';
import { applyGrain }      from './grain.js';
import { applySharpen }    from './sharpen.js';

// ─── WebGL availability ───────────────────────────────────────────────────────

let glAvailable = null; // null = untested
let glRenderer = null;

function isWebGLAvailable() {
  if (glAvailable !== null) return glAvailable;
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2');
    glAvailable = !!gl;
    // Release the context immediately
    canvas.width = 0;
    canvas.height = 0;
  } catch {
    glAvailable = false;
  }
  return glAvailable;
}

function getRenderer() {
  if (!glRenderer && isWebGLAvailable()) {
    try {
      glRenderer = new WebGLRenderer();
    } catch (err) {
      console.warn('WebGL renderer init failed, using Canvas fallback:', err);
      glAvailable = false;
    }
  }
  return glRenderer;
}

// ─── Canvas API fallback ──────────────────────────────────────────────────────

/**
 * Process an ImageData through the Canvas API pipeline.
 * This is the original implementation, kept as the fallback path.
 *
 * @param {ImageData} imageData  Source pixels (not mutated; a copy is made)
 * @param {object}    preset
 * @param {object}    options
 * @returns {ImageData}
 */
function processImageCanvas(imageData, preset, options = {}) {
  const data = new Uint8ClampedArray(imageData.data);
  const out  = new ImageData(data, imageData.width, imageData.height);

  // Note: skinMask is naturally passed through via options or as the 3rd arg

  if (preset.tonal) {
    applyTonalAdjustments(out, preset.tonal, options.skinMask);
  }

  applyColor(out, preset, options);
  
  if (preset.vibrance !== undefined && Math.abs(preset.vibrance) > 0.001) {
    applyVibrance(out, preset.vibrance, options.skinMask);
  }

  if (preset.selectiveColor) {
    applySelectiveColor(out, preset.selectiveColor, options.skinMask);
  }

  applyVignette(out, preset); // Vignette doesn't need skin protection (spatial only)

  const luts = buildToneCurveLUTs(preset);
  applyToneCurve(out, luts); // Tone curves apply to whole image (micro color shifts)
  
  if (preset.clarity !== undefined && Math.abs(preset.clarity) > 0.005) {
    applyClarity(out, preset.clarity, options.skinMask, 50);
  }

  applyGrain(out, preset, options);
  applySharpen(out, preset, options);

  return out;
}

// ─── Public API ───────────────────────────────────────────────────────────────

// ─── Preset Sanitization ──────────────────────────────────────────────────────

export const PARAM_RANGES = {
  exposure:          { min: -3.0,  max: 3.0,  default: 0    },
  highlights:        { min: -1.0,  max: 1.0,  default: 0    },
  shadows:           { min: -1.0,  max: 1.0,  default: 0    },
  brightness:        { min: -1.0,  max: 1.0,  default: 0    },
  contrast:          { min: -1.0,  max: 1.0,  default: 0    },
  blackPoint:        { min: 0,     max: 0.3,  default: 0    },
  whitePoint:        { min: 0.7,   max: 1.0,  default: 1.0  },
  saturation:        { min: 0.0,   max: 2.0,  default: 1.0  },
  vibrance:          { min: -1.0,  max: 1.0,  default: 0    },
  rMult:             { min: 0.5,   max: 1.5,  default: 1.0  },
  gMult:             { min: 0.5,   max: 1.5,  default: 1.0  },
  bMult:             { min: 0.5,   max: 1.5,  default: 1.0  },
  warmth:            { min: -0.1,  max: 0.1,  default: 0    },
  greenShift:        { min: -0.05, max: 0.05, default: 0    },
  hueShift:          { min: -30,   max: 30,   default: 0    },
  satShift:          { min: -1.0,  max: 1.0,  default: 0    },
  lumShift:          { min: -0.5,  max: 0.5,  default: 0    },
  clarity:           { min: -1.0,  max: 1.0,  default: 0    },
  grainIntensity:    { min: 0,     max: 1.0,  default: 0    },
  grainSize:         { min: 0.5,   max: 3.0,  default: 1.0  },
  vignetteIntensity: { min: 0,     max: 0.8,  default: 0    },
  sharpenAmount:     { min: 0,     max: 0.5,  default: 0.15 },
};

export function clampParam(name, value) {
  const range = PARAM_RANGES[name];
  if (!range) return value;
  return Math.max(range.min, Math.min(range.max, value));
}

export function sanitizePreset(preset) {
  const clean = { ...preset };
  if (clean.tonal) {
    clean.tonal = { ...clean.tonal };
    for (const key of ['exposure', 'highlights', 'shadows', 'brightness', 'contrast', 'blackPoint', 'whitePoint']) {
      if (clean.tonal[key] !== undefined) clean.tonal[key] = clampParam(key, clean.tonal[key]);
    }
  }
  for (const key of ['saturation', 'vibrance', 'rMult', 'gMult', 'bMult', 'warmth', 'greenShift', 'clarity', 'grainIntensity', 'grainSize', 'vignetteIntensity', 'sharpenAmount']) {
    if (clean[key] !== undefined) clean[key] = clampParam(key, clean[key]);
  }
  if (clean.selectiveColor) {
    clean.selectiveColor = { ...clean.selectiveColor };
    for (const zone of Object.keys(clean.selectiveColor)) {
      const z = { ...clean.selectiveColor[zone] };
      z.hueShift = clampParam('hueShift', z.hueShift || 0);
      z.satShift = clampParam('satShift', z.satShift || 0);
      z.lumShift = clampParam('lumShift', z.lumShift || 0);
      clean.selectiveColor[zone] = z;
    }
  }
  return clean;
}

export function processImage(imageData, preset, options = {}) {
  preset = sanitizePreset(preset);
  if (!options.forceCanvas) {
    const renderer = getRenderer();

    console.log('[Pipeline] WebGL available:', isWebGLAvailable());
    console.log('[Pipeline] Renderer:', renderer ? 'WebGLRenderer' : 'null');

    if (renderer) {
      try {
        console.log('[Pipeline] Using WebGL path');
        const result = renderer.process(imageData, preset, options);
        console.log('[Pipeline] WebGL succeeded');
        return result;
      } catch (err) {
        console.warn('[Pipeline] WebGL failed, falling back:', err.message);
      }
    }
  }

  console.log('[Pipeline] Using Canvas fallback');
  return processImageCanvas(imageData, preset, options);
}

/**
 * Returns true if the WebGL pipeline is active.
 * Useful for logging / diagnostics.
 */
export function isWebGLActive() {
  return !!getRenderer();
}
