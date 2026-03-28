/**
 * Utility module tests — Properties 1, 2, 3, 4, 5, 6
 * Validates: Requirements 1.2, 1.3, 2.3, 3.4, 5.4
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import fc from 'fast-check';

// ---------------------------------------------------------------------------
// Browser API mocks (OffscreenCanvas, navigator)
// ---------------------------------------------------------------------------

/**
 * Minimal OffscreenCanvas mock that supports putImageData / drawImage / getImageData.
 * drawImage copies pixel data from the source canvas store.
 */
class MockOffscreenCanvas {
  constructor(width, height) {
    this.width = width;
    this.height = height;
    this._store = new Uint8ClampedArray(width * height * 4);
  }

  getContext(type) {
    const canvas = this;
    return {
      putImageData(imageData) {
        canvas._store = new Uint8ClampedArray(imageData.data);
      },
      drawImage(srcCanvas, sx, sy, sw, sh) {
        // Nearest-neighbour scale from srcCanvas._store into canvas._store
        const srcW = srcCanvas.width;
        const srcH = srcCanvas.height;
        const dstW = canvas.width;
        const dstH = canvas.height;
        const dst = new Uint8ClampedArray(dstW * dstH * 4);
        for (let y = 0; y < dstH; y++) {
          for (let x = 0; x < dstW; x++) {
            const srcX = Math.floor((x / dstW) * srcW);
            const srcY = Math.floor((y / dstH) * srcH);
            const si = (srcY * srcW + srcX) * 4;
            const di = (y * dstW + x) * 4;
            dst[di]     = srcCanvas._store[si]     ?? 0;
            dst[di + 1] = srcCanvas._store[si + 1] ?? 0;
            dst[di + 2] = srcCanvas._store[si + 2] ?? 0;
            dst[di + 3] = srcCanvas._store[si + 3] ?? 255;
          }
        }
        canvas._store = dst;
      },
      getImageData(x, y, w, h) {
        return { data: new Uint8ClampedArray(canvas._store), width: w, height: h };
      },
      save() {},
      restore() {},
      translate() {},
      scale() {},
      rotate() {},
    };
  }
}

// Install globals before importing modules that use them
vi.stubGlobal('OffscreenCanvas', MockOffscreenCanvas);
vi.stubGlobal('navigator', {
  userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeImageData(width, height) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < data.length; i += 4) {
    data[i]     = 128;
    data[i + 1] = 100;
    data[i + 2] = 80;
    data[i + 3] = 255;
  }
  return { data, width, height };
}

// ---------------------------------------------------------------------------
// Import modules AFTER globals are stubbed
// ---------------------------------------------------------------------------
import { ErrorTypes } from '../errors.js';
import { downscale } from '../memory.js';
import { resizeToMax } from '../image.js';
import { makeFilename } from '../export.js';

// ---------------------------------------------------------------------------
// Property 1: Error types are well-formed
// Validates: Requirements 1.2, 1.3
// ---------------------------------------------------------------------------
describe('ErrorTypes — property tests', () => {
  it('Property 1: all error types have a non-empty message string and boolean recoverable', () => {
    /**
     * **Validates: Requirements 1.2, 1.3**
     */
    fc.assert(
      fc.property(
        fc.constantFrom(...Object.keys(ErrorTypes)),
        (key) => {
          const e = ErrorTypes[key];
          return (
            typeof e.message === 'string' &&
            e.message.length > 0 &&
            typeof e.recoverable === 'boolean'
          );
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ---------------------------------------------------------------------------
// Property 2: downscale produces correct dimensions
// Validates: Requirements 2.3
// ---------------------------------------------------------------------------
describe('downscale — property tests', () => {
  it('Property 2: result dimensions equal floor(w * factor) × floor(h * factor)', () => {
    /**
     * **Validates: Requirements 2.3**
     */
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 200 }),
        fc.integer({ min: 1, max: 200 }),
        fc.double({ min: 0.1, max: 1.0, noNaN: true }),
        (w, h, factor) => {
          const imageData = makeImageData(w, h);
          const result = downscale(imageData, factor);
          return (
            result.width  === Math.floor(w * factor) &&
            result.height === Math.floor(h * factor)
          );
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ---------------------------------------------------------------------------
// Properties 3, 4, 5: resizeToMax
// Validates: Requirements 3.4
// ---------------------------------------------------------------------------
describe('resizeToMax — property tests', () => {
  it('Property 3: result never exceeds maxDimension on either axis', () => {
    /**
     * **Validates: Requirements 3.4**
     */
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 500 }),
        fc.integer({ min: 1, max: 500 }),
        fc.integer({ min: 1, max: 500 }),
        (w, h, maxDim) => {
          const imageData = makeImageData(w, h);
          const result = resizeToMax(imageData, maxDim);
          return Math.max(result.width, result.height) <= maxDim;
        },
      ),
      { numRuns: 100 },
    );
  });

  it('Property 4: result dimensions match floor(w * scale) × floor(h * scale)', () => {
    /**
     * **Validates: Requirements 3.4**
     * When resizing is needed, result dimensions must equal floor(w * scale) × floor(h * scale)
     * where scale = maxDimension / Math.max(w, h). This is the tightest correct statement
     * of aspect-ratio preservation under integer floor rounding.
     */
    fc.assert(
      fc.property(
        fc.integer({ min: 2, max: 500 }),
        fc.integer({ min: 2, max: 500 }),
        fc.integer({ min: 1, max: 100 }),
        (w, h, maxDim) => {
          fc.pre(maxDim < Math.max(w, h));
          const scale = maxDim / Math.max(w, h);
          const expectedW = Math.floor(w * scale);
          const expectedH = Math.floor(h * scale);
          fc.pre(expectedW >= 1 && expectedH >= 1);
          const imageData = makeImageData(w, h);
          const result = resizeToMax(imageData, maxDim);
          return result.width === expectedW && result.height === expectedH;
        },
      ),
      { numRuns: 100 },
    );
  });

  it('Property 5: resizeToMax is identity when image already fits within bounds', () => {
    /**
     * **Validates: Requirements 3.4**
     */
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 100 }),
        fc.integer({ min: 1, max: 100 }),
        fc.integer({ min: 0, max: 100 }),
        (w, h, extra) => {
          const maxDim = Math.max(w, h) + extra;
          const imageData = makeImageData(w, h);
          const result = resizeToMax(imageData, maxDim);
          return result.width === w && result.height === h;
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ---------------------------------------------------------------------------
// Property 6: Export filename matches required format
// Validates: Requirements 5.4
// ---------------------------------------------------------------------------
describe('makeFilename — property tests', () => {
  it('Property 6: filename matches grainframe-{presetId}-{timestamp}.jpg', () => {
    /**
     * **Validates: Requirements 5.4**
     */
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 50 }).filter(s => /^[a-z0-9-]+$/.test(s)),
        fc.integer({ min: 0 }),
        (presetId, timestamp) => {
          const name = makeFilename(presetId, timestamp);
          return name === `grainframe-${presetId}-${timestamp}.jpg`;
        },
      ),
      { numRuns: 100 },
    );
  });
});
