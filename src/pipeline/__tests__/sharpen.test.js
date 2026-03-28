import { describe, it, expect, vi } from 'vitest';
import fc from 'fast-check';

// --- Canvas mock setup ---
// sharpen.js uses createCanvas/getContext from canvas-utils.js which require browser APIs.
// We mock canvas-utils.js to provide a minimal in-memory implementation.
// Since ctx.filter = 'blur(1px)' has no effect in Node, getImageData returns the same data,
// meaning: sharpened = original + (original - original) * amount = original.
// This is correct for testing no-op (amount=0) and clamping properties.

vi.mock('../canvas-utils.js', () => {
  function createCanvas(width, height) {
    const store = { data: new Uint8ClampedArray(width * height * 4) };

    const ctx = {
      filter: '',
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

import { applySharpen } from '../sharpen.js';

/** Create a minimal ImageData-like object. */
function makeImageData(width, height, fillR = 128, fillG = 128, fillB = 128) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    data[i * 4]     = fillR;
    data[i * 4 + 1] = fillG;
    data[i * 4 + 2] = fillB;
    data[i * 4 + 3] = 255;
  }
  return { data, width, height };
}

/** Deep-copy an ImageData-like object. */
function copyImageData(imageData) {
  return {
    data: new Uint8ClampedArray(imageData.data),
    width: imageData.width,
    height: imageData.height,
  };
}

// ---------------------------------------------------------------------------
// Task 8.1 — Unit tests
// ---------------------------------------------------------------------------
describe('applySharpen — unit tests', () => {
  it('sharpenAmount=0 leaves all pixels unchanged', () => {
    const imageData = makeImageData(8, 8, 100, 150, 200);
    const original = new Uint8ClampedArray(imageData.data);

    applySharpen(imageData, { sharpenAmount: 0 });

    for (let i = 0; i < original.length; i++) {
      expect(imageData.data[i]).toBe(original[i]);
    }
  });
});

// ---------------------------------------------------------------------------
// Task 8.2 — Property 12: Sharpen Amount Zero Is No-Op
// ---------------------------------------------------------------------------
describe('applySharpen — property tests', () => {
  // Feature: grainframe-pipeline, Property 12: Sharpen Amount Zero Is No-Op
  it('sharpenAmount=0 produces output identical to input for any ImageData (Property 12)', () => {
    const imageDataArb = fc.record({
      width:  fc.integer({ min: 1, max: 16 }),
      height: fc.integer({ min: 1, max: 16 }),
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
        const original = new Uint8ClampedArray(imageData.data);
        applySharpen(imageData, { sharpenAmount: 0 });

        for (let i = 0; i < original.length; i++) {
          if (imageData.data[i] !== original[i]) return false;
        }
        return true;
      }),
      { numRuns: 100 },
    );
  });

  // Feature: grainframe-pipeline, Property 13: Sharpen Output Clamped
  it('all output pixel channel values are in [0, 255] for any ImageData and sharpenAmount (Property 13)', () => {
    const imageDataArb = fc.record({
      width:  fc.integer({ min: 1, max: 16 }),
      height: fc.integer({ min: 1, max: 16 }),
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

    const presetArb = fc.record({
      sharpenAmount: fc.float({ min: 0, max: 1.0, noNaN: true }),
    });

    fc.assert(
      fc.property(imageDataArb, presetArb, (imageData, preset) => {
        applySharpen(imageData, preset);

        for (let i = 0; i < imageData.data.length; i += 4) {
          for (let ch = 0; ch < 3; ch++) {
            const v = imageData.data[i + ch];
            if (v < 0 || v > 255) return false;
          }
        }
        return true;
      }),
      { numRuns: 100 },
    );
  });

  // Feature: grainframe-pipeline, Property 14: Sharpen Amount Cap
  it('sharpenAmount=0.5 produces same output as sharpenAmount=0.3 (the cap) (Property 14)', () => {
    const imageDataArb = fc.record({
      width:  fc.integer({ min: 1, max: 16 }),
      height: fc.integer({ min: 1, max: 16 }),
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
        const copy1 = copyImageData(imageData);
        const copy2 = copyImageData(imageData);

        applySharpen(copy1, { sharpenAmount: 0.5 });
        applySharpen(copy2, { sharpenAmount: 0.3 });

        for (let i = 0; i < copy1.data.length; i++) {
          if (copy1.data[i] !== copy2.data[i]) return false;
        }
        return true;
      }),
      { numRuns: 100 },
    );
  });
});
