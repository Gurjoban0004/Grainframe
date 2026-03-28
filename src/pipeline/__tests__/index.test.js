import { describe, it, expect, vi } from 'vitest';
import fc from 'fast-check';

// --- ImageData polyfill ---
// index.js calls `new ImageData(data, width, height)` which is a browser API not available in Node.
// We provide a minimal polyfill so the pipeline can construct its output object.
if (typeof globalThis.ImageData === 'undefined') {
  globalThis.ImageData = class ImageData {
    constructor(data, width, height) {
      this.data   = data instanceof Uint8ClampedArray ? data : new Uint8ClampedArray(data);
      this.width  = width;
      this.height = height ?? (this.data.length / 4 / width);
    }
  };
}

// --- Canvas mock setup ---
// index.js → grain.js and sharpen.js use createCanvas/getContext from canvas-utils.js.
// We mock canvas-utils.js with an in-memory implementation (same pattern as grain/sharpen tests).

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

import { processImage } from '../index.js';
import classicChrome from '../../presets/classic-chrome.json';

/** Create a minimal ImageData-like object filled with a single color. */
function makeImageData(width, height, r = 128, g = 128, b = 128) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    data[i * 4]     = r;
    data[i * 4 + 1] = g;
    data[i * 4 + 2] = b;
    data[i * 4 + 3] = 255;
  }
  return { data, width, height };
}

// ---------------------------------------------------------------------------
// Task 10.1 — Unit tests for index.js
// ---------------------------------------------------------------------------
describe('processImage — unit tests', () => {
  it('returns an ImageData with the same dimensions as input', () => {
    const input = makeImageData(16, 8);
    const output = processImage(input, classicChrome);

    expect(output.width).toBe(16);
    expect(output.height).toBe(8);
    expect(output.data.length).toBe(16 * 8 * 4);
  });

  it('Classic Chrome lifts blacks: pure black pixel has at least one channel > 0', () => {
    const input = makeImageData(4, 4, 0, 0, 0);
    const output = processImage(input, classicChrome);

    // Check the first pixel
    const r = output.data[0];
    const g = output.data[1];
    const b = output.data[2];

    expect(r > 0 || g > 0 || b > 0).toBe(true);
  });

  it('Classic Chrome compresses highlights: pure white pixel has at least one channel < 255', () => {
    const input = makeImageData(4, 4, 255, 255, 255);
    const output = processImage(input, classicChrome);

    // Check the first pixel
    const r = output.data[0];
    const g = output.data[1];
    const b = output.data[2];

    expect(r < 255 || g < 255 || b < 255).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Task 10.2 — Property 15: processImage Does Not Mutate Input
// ---------------------------------------------------------------------------
describe('processImage — property tests', () => {
  // Feature: grainframe-pipeline, Property 15: processImage Does Not Mutate Input
  it('calling processImage does not modify the original ImageData pixel data (Property 15)', () => {
    const imageDataArb = fc.record({
      width:  fc.integer({ min: 2, max: 16 }),
      height: fc.integer({ min: 2, max: 16 }),
    }).chain(({ width, height }) =>
      fc.array(
        fc.tuple(
          fc.integer({ min: 0, max: 255 }),
          fc.integer({ min: 0, max: 255 }),
          fc.integer({ min: 0, max: 255 }),
        ),
        { minLength: width * height, maxLength: width * height },
      ).map(pixels => {
        const data = new Uint8ClampedArray(width * height * 4);
        for (let i = 0; i < pixels.length; i++) {
          data[i * 4]     = pixels[i][0];
          data[i * 4 + 1] = pixels[i][1];
          data[i * 4 + 2] = pixels[i][2];
          data[i * 4 + 3] = 255;
        }
        return { data, width, height };
      })
    );

    fc.assert(
      fc.property(imageDataArb, (imageData) => {
        const snapshot = new Uint8ClampedArray(imageData.data);

        processImage(imageData, classicChrome);

        for (let i = 0; i < snapshot.length; i++) {
          if (imageData.data[i] !== snapshot[i]) return false;
        }
        return true;
      }),
      { numRuns: 100 },
    );
  });

  // Feature: grainframe-pipeline, Property 16: Classic Chrome Lifts Blacks and Compresses Highlights
  it('Classic Chrome: pure black pixel has ≥1 channel > 0, pure white pixel has ≥1 channel < 255 (Property 16)', () => {
    fc.assert(
      fc.property(fc.constant(null), () => {
        // Pure black input
        const blackInput = makeImageData(4, 4, 0, 0, 0);
        const blackOutput = processImage(blackInput, classicChrome);
        const blackR = blackOutput.data[0];
        const blackG = blackOutput.data[1];
        const blackB = blackOutput.data[2];
        if (!(blackR > 0 || blackG > 0 || blackB > 0)) return false;

        // Pure white input
        const whiteInput = makeImageData(4, 4, 255, 255, 255);
        const whiteOutput = processImage(whiteInput, classicChrome);
        const whiteR = whiteOutput.data[0];
        const whiteG = whiteOutput.data[1];
        const whiteB = whiteOutput.data[2];
        if (!(whiteR < 255 || whiteG < 255 || whiteB < 255)) return false;

        return true;
      }),
      { numRuns: 100 },
    );
  });
});
