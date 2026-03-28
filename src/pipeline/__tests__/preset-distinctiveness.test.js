import { describe, it } from 'vitest';
import fc from 'fast-check';
import { processImage } from '../index.js';
import classicChrome from '../../presets/classic-chrome.json';
import softFilm from '../../presets/soft-film.json';
import velvia from '../../presets/velvia.json';

// --- ImageData polyfill ---
if (typeof globalThis.ImageData === 'undefined') {
  globalThis.ImageData = class ImageData {
    constructor(data, width, height) {
      this.data   = data instanceof Uint8ClampedArray ? data : new Uint8ClampedArray(data);
      this.width  = width;
      this.height = height ?? (this.data.length / 4 / width);
    }
  };
}

// --- Canvas mock ---
import { vi } from 'vitest';

vi.mock('../canvas-utils.js', () => {
  function createCanvas(width, height) {
    const store = { data: new Uint8ClampedArray(width * height * 4) };
    const ctx = {
      filter: '',
      createImageData(w, h) {
        return { data: new Uint8ClampedArray(w * h * 4), width: w, height: h };
      },
      putImageData(imageData) {
        store.data = new Uint8ClampedArray(imageData.data);
      },
      getImageData(x, y, w, h) {
        return { data: new Uint8ClampedArray(store.data), width: w, height: h };
      },
      drawImage(srcCanvas) {
        store.data = new Uint8ClampedArray(srcCanvas._store.data);
      },
    };
    return { _store: store, _ctx: ctx, width, height };
  }
  function getContext(canvas) {
    return canvas._ctx;
  }
  return { createCanvas, getContext };
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Compare two Uint8ClampedArray byte-for-byte; returns true if identical. */
function arraysEqual(a, b) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

/** Compute luminance for a single pixel (sRGB, 0–255 values). */
function luminance(r, g, b) {
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

/** Compute HSL saturation for a single pixel (values 0–255). */
function hslSaturation(r, g, b) {
  const rn = r / 255, gn = g / 255, bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  return max > 0 ? (max - min) / max : 0;
}

/** Average luminance of a set of pixels [{r,g,b}]. */
function avgLuminance(pixels) {
  if (pixels.length === 0) return 0;
  const sum = pixels.reduce((acc, p) => acc + luminance(p.r, p.g, p.b), 0);
  return sum / pixels.length;
}

/** Average HSL saturation across all pixels in an ImageData. */
function avgSaturation(imageData) {
  const d = imageData.data;
  const n = d.length / 4;
  let sum = 0;
  for (let i = 0; i < n; i++) {
    sum += hslSaturation(d[i * 4], d[i * 4 + 1], d[i * 4 + 2]);
  }
  return sum / n;
}

/**
 * Extract pixels from an ImageData whose INPUT luminance falls in the
 * bottom 25% of all pixel luminances.
 */
function darkestQuartilePixels(inputImageData, outputImageData) {
  const d = inputImageData.data;
  const od = outputImageData.data;
  const n = d.length / 4;

  // Compute input luminances
  const lums = [];
  for (let i = 0; i < n; i++) {
    lums.push(luminance(d[i * 4], d[i * 4 + 1], d[i * 4 + 2]));
  }

  // Find the 25th-percentile threshold
  const sorted = [...lums].sort((a, b) => a - b);
  const threshold = sorted[Math.floor(sorted.length * 0.25)];

  // Collect output pixels whose input lum is <= threshold
  const pixels = [];
  for (let i = 0; i < n; i++) {
    if (lums[i] <= threshold) {
      pixels.push({ r: od[i * 4], g: od[i * 4 + 1], b: od[i * 4 + 2] });
    }
  }
  return pixels;
}

// ---------------------------------------------------------------------------
// Arbitraries
// ---------------------------------------------------------------------------

/** Random ImageData: width 4–64, height 4–64, random RGBA pixels (alpha=255). */
const randomImageDataArb = fc
  .record({
    width:  fc.integer({ min: 4, max: 64 }),
    height: fc.integer({ min: 4, max: 64 }),
  })
  .chain(({ width, height }) => {
    const n = width * height;
    return fc
      .array(fc.integer({ min: 0, max: 255 }), { minLength: n * 3, maxLength: n * 3 })
      .map(vals => {
        const data = new Uint8ClampedArray(n * 4);
        for (let i = 0; i < n; i++) {
          data[i * 4]     = vals[i * 3];
          data[i * 4 + 1] = vals[i * 3 + 1];
          data[i * 4 + 2] = vals[i * 3 + 2];
          data[i * 4 + 3] = 255;
        }
        return { data, width, height };
      });
  });

/**
 * ImageData with at least 25% dark pixels (luminance < 80).
 * We guarantee this by forcing the first quarter of pixels to be dark.
 */
const darkImageDataArb = fc
  .record({
    width:  fc.integer({ min: 8, max: 32 }),
    height: fc.integer({ min: 8, max: 32 }),
  })
  .chain(({ width, height }) => {
    const n = width * height;
    const darkCount = Math.ceil(n * 0.30); // 30% dark pixels
    return fc
      .tuple(
        // dark pixels: R,G,B each 0–60
        fc.array(fc.integer({ min: 0, max: 60 }), { minLength: darkCount * 3, maxLength: darkCount * 3 }),
        // remaining pixels: R,G,B each 0–255
        fc.array(fc.integer({ min: 0, max: 255 }), { minLength: (n - darkCount) * 3, maxLength: (n - darkCount) * 3 }),
      )
      .map(([darkVals, restVals]) => {
        const data = new Uint8ClampedArray(n * 4);
        for (let i = 0; i < darkCount; i++) {
          data[i * 4]     = darkVals[i * 3];
          data[i * 4 + 1] = darkVals[i * 3 + 1];
          data[i * 4 + 2] = darkVals[i * 3 + 2];
          data[i * 4 + 3] = 255;
        }
        for (let i = 0; i < n - darkCount; i++) {
          const idx = darkCount + i;
          data[idx * 4]     = restVals[i * 3];
          data[idx * 4 + 1] = restVals[i * 3 + 1];
          data[idx * 4 + 2] = restVals[i * 3 + 2];
          data[idx * 4 + 3] = 255;
        }
        return { data, width, height };
      });
  });

/**
 * ImageData with varied hues: at least 25% of pixels have R≠G or G≠B.
 * We guarantee this by forcing the first quarter of pixels to be colorful.
 */
const colorfulImageDataArb = fc
  .record({
    width:  fc.integer({ min: 8, max: 32 }),
    height: fc.integer({ min: 8, max: 32 }),
  })
  .chain(({ width, height }) => {
    const n = width * height;
    const colorCount = Math.ceil(n * 0.30);
    return fc
      .tuple(
        // colorful pixels: R 100–255, G 0–100, B 0–100 (clearly non-grey)
        fc.array(
          fc.tuple(
            fc.integer({ min: 100, max: 255 }),
            fc.integer({ min: 0,   max: 80  }),
            fc.integer({ min: 0,   max: 80  }),
          ),
          { minLength: colorCount, maxLength: colorCount },
        ),
        // remaining pixels: any values
        fc.array(fc.integer({ min: 0, max: 255 }), { minLength: (n - colorCount) * 3, maxLength: (n - colorCount) * 3 }),
      )
      .map(([colorPixels, restVals]) => {
        const data = new Uint8ClampedArray(n * 4);
        for (let i = 0; i < colorCount; i++) {
          data[i * 4]     = colorPixels[i][0];
          data[i * 4 + 1] = colorPixels[i][1];
          data[i * 4 + 2] = colorPixels[i][2];
          data[i * 4 + 3] = 255;
        }
        for (let i = 0; i < n - colorCount; i++) {
          const idx = colorCount + i;
          data[idx * 4]     = restVals[i * 3];
          data[idx * 4 + 1] = restVals[i * 3 + 1];
          data[idx * 4 + 2] = restVals[i * 3 + 2];
          data[idx * 4 + 3] = 255;
        }
        return { data, width, height };
      });
  });

// ---------------------------------------------------------------------------
// Property 1: Three preset outputs are pixel-distinct
// Feature: preset-switcher-compare, Property 1: three preset outputs are pixel-distinct
// ---------------------------------------------------------------------------
describe('Property 1: Three preset outputs are pixel-distinct', () => {
  it('classicChrome, softFilm, and velvia produce different pixel data for random inputs', () => {
    fc.assert(
      fc.property(randomImageDataArb, (img) => {
        const ccOut  = processImage(img, classicChrome);
        const sfOut  = processImage(img, softFilm);
        const vvOut  = processImage(img, velvia);

        const ccEqSf = arraysEqual(ccOut.data, sfOut.data);
        const ccEqVv = arraysEqual(ccOut.data, vvOut.data);
        const sfEqVv = arraysEqual(sfOut.data, vvOut.data);

        // All three outputs must be distinct from each other
        return !ccEqSf && !ccEqVv && !sfEqVv;
      }),
      { numRuns: 50 },
    );
  });
});

// ---------------------------------------------------------------------------
// Property 2: Soft-film lifts shadows above classic-chrome
// Feature: preset-switcher-compare, Property 2: soft-film shadow lift
// ---------------------------------------------------------------------------
describe('Property 2: Soft-film lifts shadows above classic-chrome', () => {
  it('avgLuminance of darkest-quartile pixels is higher for softFilm than classicChrome', () => {
    fc.assert(
      fc.property(darkImageDataArb, (img) => {
        const ccOut = processImage(img, classicChrome);
        const sfOut = processImage(img, softFilm);

        const ccDark = darkestQuartilePixels(img, ccOut);
        const sfDark = darkestQuartilePixels(img, sfOut);

        if (ccDark.length === 0 || sfDark.length === 0) return true; // skip degenerate

        const ccAvg = avgLuminance(ccDark);
        const sfAvg = avgLuminance(sfDark);

        return sfAvg > ccAvg;
      }),
      { numRuns: 50 },
    );
  });
});

// ---------------------------------------------------------------------------
// Property 3: Velvia boosts saturation above classic-chrome
// Feature: preset-switcher-compare, Property 3: velvia saturation boost
// ---------------------------------------------------------------------------
describe('Property 3: Velvia boosts saturation above classic-chrome', () => {
  it('avgSaturation of velvia output is higher than classicChrome output', () => {
    fc.assert(
      fc.property(colorfulImageDataArb, (img) => {
        const ccOut = processImage(img, classicChrome);
        const vvOut = processImage(img, velvia);

        const ccSat = avgSaturation(ccOut);
        const vvSat = avgSaturation(vvOut);

        return vvSat > ccSat;
      }),
      { numRuns: 50 },
    );
  });
});
