/**
 * Apply tonal adjustments to imageData in-place.
 * 
 * All adjustments operate on luminance-aware basis to preserve
 * color relationships while shifting tones.
 *
 * @param {ImageData} imageData
 * @param {Object} tonal
 *   exposure:    -3.0 to +3.0 (EV stops)
 *   brightness:  -1.0 to +1.0
 *   contrast:    -1.0 to +1.0
 *   highlights:  -1.0 to +1.0
 *   shadows:     -1.0 to +1.0
 *   blackPoint:  0.0 to 0.3
 *   whitePoint:  0.7 to 1.0
 */
export function applyTonalAdjustments(imageData, tonal) {
  const {
    exposure = 0,
    brightness = 0,
    contrast = 0,
    highlights = 0,
    shadows = 0,
    blackPoint = 0,
    whitePoint = 1.0
  } = tonal;
  
  // Quick bail if everything is neutral
  if (Math.abs(exposure) < 0.01 &&
      Math.abs(brightness) < 0.01 &&
      Math.abs(contrast) < 0.01 &&
      Math.abs(highlights) < 0.01 &&
      Math.abs(shadows) < 0.01 &&
      blackPoint < 0.005 &&
      whitePoint > 0.995) {
    return imageData;
  }
  
  // ── Build a 256-entry lookup table ──
  // This is much faster than computing per-pixel math
  // since all these operations are 1D (luminance-based)
  const lut = new Uint8Array(256);
  
  for (let i = 0; i < 256; i++) {
    let v = i / 255;  // normalize to 0-1
    
    // ── 1. Exposure (multiplicative gain) ──
    if (Math.abs(exposure) > 0.01) {
      // Simulate EV stops: each stop = 2× light
      // Use a soft curve to prevent harsh clipping
      const gain = Math.pow(2, exposure);
      v = v * gain;
      // Soft highlight rolloff to prevent hard clipping
      if (v > 1.0) {
        // Shoulder compression: gently approach 1.0
        // Map overshoot [1.0, ∞) → [1.0, 1.0) using exponential decay
        v = 1.0 - 0.3 * Math.exp(-(v - 1.0) * 2.0);
      }
    }
    
    // ── 2. Black point (lift the floor) ──
    if (blackPoint > 0.005) {
      v = blackPoint + v * (1.0 - blackPoint);
    }
    
    // ── 3. White point (lower the ceiling) ──
    if (whitePoint < 0.995) {
      v = v * whitePoint;
    }
    
    // ── 4. Highlights (compress/expand upper range) ──
    if (Math.abs(highlights) > 0.01) {
      // Only affect the upper half of the tonal range
      // Use a smooth weight function centered at highlights
      const highlightWeight = smoothstep(0.3, 0.7, v);
      
      if (highlights < 0) {
        // Negative highlights = compress bright values downward
        // Pull values toward midpoint
        const compressed = v - highlightWeight * Math.abs(highlights) * (v - 0.5) * 0.8;
        v = compressed;
      } else {
        // Positive highlights = push bright values brighter
        const expanded = v + highlightWeight * highlights * (1.0 - v) * 0.6;
        v = expanded;
      }
    }
    
    // ── 5. Shadows (compress/expand lower range) ──
    if (Math.abs(shadows) > 0.01) {
      // Only affect the lower half of the tonal range
      const shadowWeight = 1.0 - smoothstep(0.3, 0.7, v);
      
      if (shadows > 0) {
        // Positive shadows = lift dark values upward
        const lifted = v + shadowWeight * shadows * (0.5 - v) * 0.8;
        v = lifted;
      } else {
        // Negative shadows = crush dark values darker
        const crushed = v + shadowWeight * shadows * v * 0.6;
        v = crushed;
      }
    }
    
    // ── 6. Brightness (midtone-weighted additive) ──
    if (Math.abs(brightness) > 0.01) {
      // Bell curve centered at 0.5 — maximum effect on midtones,
      // tapers off at shadows and highlights
      const midWeight = Math.exp(-Math.pow((v - 0.5) / 0.3, 2));
      v = v + brightness * midWeight * 0.3;
    }
    
    // ── 7. Contrast (S-curve around midpoint) ──
    if (Math.abs(contrast) > 0.01) {
      // Pivot around 0.5
      // Positive contrast: steepen the curve (expand midtone range)
      // Negative contrast: flatten the curve (compress midtone range)
      const centered = v - 0.5;
      
      if (contrast > 0) {
        // Sigmoidal contrast boost
        const k = 1.0 + contrast * 3.0;  // steepness
        v = 0.5 + centered * k / (1.0 + Math.abs(centered) * (k - 1) * 2);
      } else {
        // Linear contrast reduction
        v = 0.5 + centered * (1.0 + contrast * 0.8);
      }
    }
    
    // Final clamp
    lut[i] = Math.max(0, Math.min(255, Math.round(v * 255)));
  }
  
  // ── Apply LUT to all channels ──
  // IMPORTANT: We apply the same tonal LUT to R, G, B equally.
  // This preserves color ratios (hue) while shifting tones.
  // Per-channel tone curves happen AFTER this in the pipeline.
  const data = imageData.data;
  for (let i = 0; i < data.length; i += 4) {
    data[i]     = lut[data[i]];
    data[i + 1] = lut[data[i + 1]];
    data[i + 2] = lut[data[i + 2]];
    // Alpha unchanged
  }
  
  return imageData;
}

/**
 * Smooth interpolation function.
 * Returns 0 when x <= edge0, 1 when x >= edge1,
 * smooth curve between.
 */
function smoothstep(edge0, edge1, x) {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}
