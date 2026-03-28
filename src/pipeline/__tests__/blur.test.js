import { describe, it, expect, vi } from 'vitest';

// --- Canvas mock setup ---
// blur.js uses createCanvas/getContext from canvas-utils.js which require browser APIs.
// We mock canvas-utils.js to provide a minimal in-memory implementation.
// When ctx.filter is defined, gaussianBlur uses the filter path (drawImage copies store data).
// When ctx.filter is undefined, gaussianBlur falls back to the 3-pass box blur.

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

import { gaussianBlur } from '../blur.js';

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

// ---------------------------------------------------------------------------
// Task 9.1 — Unit tests for gaussianBlur
// ---------------------------------------------------------------------------
describe('gaussianBlur — unit tests', () => {
  it('returns an ImageData with the same width as input', () => {
    const input = makeImageData(16, 8);
    const result = gaussianBlur(input, 2);
    expect(result.width).toBe(16);
  });

  it('returns an ImageData with the same height as input', () => {
    const input = makeImageData(16, 8);
    const result = gaussianBlur(input, 2);
    expect(result.height).toBe(8);
  });

  it('returns an ImageData with the same dimensions for a square image', () => {
    const input = makeImageData(32, 32);
    const result = gaussianBlur(input, 1);
    expect(result.width).toBe(32);
    expect(result.height).toBe(32);
  });

  it('returns an ImageData with the same dimensions for a 1x1 image', () => {
    const input = makeImageData(1, 1, 200, 100, 50);
    const result = gaussianBlur(input, 1);
    expect(result.width).toBe(1);
    expect(result.height).toBe(1);
  });

  it('returns an object with a data property', () => {
    const input = makeImageData(4, 4);
    const result = gaussianBlur(input, 1);
    expect(result.data).toBeDefined();
    expect(result.data.length).toBe(4 * 4 * 4);
  });
});
