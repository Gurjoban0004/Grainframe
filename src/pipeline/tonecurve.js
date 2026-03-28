// tonecurve.js — Catmull-Rom spline tone curve LUT builder + apply
// Operates in sRGB space. No framework imports.

/**
 * Build a 256-entry LUT from control points using Catmull-Rom interpolation.
 * Control points: array of [x, y] pairs, x and y in [0, 255].
 * @param {Array<[number,number]>} points
 * @returns {Uint8Array}
 */
function buildLUT(points) {
  // Sort by x, add phantom endpoints for Catmull-Rom
  const pts = [...points].sort((a, b) => a[0] - b[0]);
  // Clamp-extend endpoints
  const p = [
    [pts[0][0] - 1, pts[0][1]],
    ...pts,
    [pts[pts.length - 1][0] + 1, pts[pts.length - 1][1]],
  ];

  const lut = new Uint8Array(256);

  for (let x = 0; x < 256; x++) {
    // Find segment
    let seg = 1;
    while (seg < p.length - 2 && p[seg + 1][0] <= x) seg++;

    const p0 = p[seg - 1], p1 = p[seg], p2 = p[seg + 1], p3 = p[Math.min(seg + 2, p.length - 1)];
    const dx = p2[0] - p1[0];
    const t = dx === 0 ? 0 : (x - p1[0]) / dx;

    // Catmull-Rom formula
    const t2 = t * t, t3 = t2 * t;
    const y =
      0.5 * (
        (2 * p1[1]) +
        (-p0[1] + p2[1]) * t +
        (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 +
        (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3
      );

    lut[x] = Math.min(255, Math.max(0, Math.round(y)));
  }

  // Monotonicity clamp: ensure lut[i] >= lut[i-1]
  for (let i = 1; i < 256; i++) {
    if (lut[i] < lut[i - 1]) lut[i] = lut[i - 1];
  }

  return lut;
}

/**
 * Build per-channel LUTs from preset tone curve definition.
 * preset.toneCurve = { r: [[x,y],...], g: [...], b: [...], rgb: [...] }
 * Channel-specific points override the master rgb curve.
 * @param {object} preset
 * @returns {{ r: Uint8Array, g: Uint8Array, b: Uint8Array }}
 */
export function buildToneCurveLUTs(preset) {
  const tc = preset.toneCurve || {};
  const master = tc.rgb || [[0, 0], [255, 255]];
  return {
    r: buildLUT(tc.r || master),
    g: buildLUT(tc.g || master),
    b: buildLUT(tc.b || master),
  };
}

/**
 * Apply pre-built tone curve LUTs to an ImageData in-place.
 * @param {ImageData} imageData
 * @param {{ r: Uint8Array, g: Uint8Array, b: Uint8Array }} luts
 */
export function applyToneCurve(imageData, luts) {
  const d = imageData.data;
  for (let i = 0; i < d.length; i += 4) {
    d[i]     = luts.r[d[i]];
    d[i + 1] = luts.g[d[i + 1]];
    d[i + 2] = luts.b[d[i + 2]];
    // alpha unchanged
  }
}
