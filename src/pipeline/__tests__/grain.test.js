import { describe, it, expect, vi, beforeEach } from 'vitest';
import fc from 'fast-check';

// --- Canvas mock setup ---
// grain.js uses createCanvas/getContext from canvas-utils.js which require browser APIs.
// We mock canvas-utils.js to provide a minimal in-memory implementation.
// The mock also exposes a `lastBlurFilter` tracker so tests can inspect the blur radius.

const canvasMockState = { lastBlurFilter: null };

vi.mock('../canvas-utils.js', () => {
  function createCanvas(width, height) {
    // Each canvas has its own pixel store
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

import * as canvasUtils from '../canvas-utils.js';
import { applyGrain } from '../grain.js';

beforeEach(() => {
  canvasMockState.lastBlurFilter = null;
});

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

/**
 * Call applyGrain and capture the blur filter value set on the blur canvas context.
 * Returns the numeric blur radius extracted from the filter string, or null if not set.
 */
function applyGrainAndCaptureBlur(imageData, preset, options) {
  let blurFilterValue = null;
  let ctxCallCount = 0;

  const origGetContext = canvasUtils.getContext;
  canvasUtils.getContext = (canvas) => {
    const ctx = origGetContext(canvas);
    ctxCallCount++;
    if (ctxCallCount === 2) {
      // The second getContext call is for the blur canvas — wrap to capture filter
      return new Proxy(ctx, {
        set(target, prop, value) {
          if (prop === 'filter') blurFilterValue = value;
          target[prop] = value;
          return true;
        },
      });
    }
    return ctx;
  };

  applyGrain(imageData, preset, options);
  canvasUtils.getContext = origGetContext;

  if (!blurFilterValue) return null;
  const match = blurFilterValue.match(/blur\(([0-9.e+\-]+)px\)/);
  return match ? parseFloat(match[1]) : null;
}

// ---------------------------------------------------------------------------
// Task 7.1 — Unit tests
// ---------------------------------------------------------------------------
describe('applyGrain — unit tests', () => {
  it('grainIntensity=0 leaves all pixels unchanged', () => {
    const imageData = makeImageData(8, 8, 100, 150, 200);
    const original = new Uint8ClampedArray(imageData.data);

    applyGrain(imageData, { grainIntensity: 0, grainSize: 1, grainSeed: 1 });

    for (let i = 0; i < original.length; i++) {
      expect(imageData.data[i]).toBe(original[i]);
    }
  });
});

// ---------------------------------------------------------------------------
// Task 4.3 — Property 3: Grain blur radius scales with export/preview ratio
// Validates: Requirements 4.1, 4.2
// ---------------------------------------------------------------------------
describe('applyGrain — Property 3: blur radius scales with export/preview ratio', () => {
  it('export blurRadius equals Math.max(0.5, grainSize * (exportWidth / previewWidth))', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 100, max: 1024 }),           // previewWidth
        fc.integer({ min: 1025, max: 4096 }),          // exportWidth
        fc.float({ min: Math.fround(0.5), max: Math.fround(3.0), noNaN: true }), // grainSize (flat field)
        (previewWidth, exportWidth, grainSize) => {
          const preset = { grainIntensity: 0.02, grainSize, grainSeed: 42 };
          const imageData = makeImageData(16, 16);

          const actualBlur = applyGrainAndCaptureBlur(imageData, preset, {
            mode: 'export',
            previewWidth,
            exportWidth,
          });

          if (actualBlur === null) return false;

          const expectedBlur = Math.max(0.5, grainSize * (exportWidth / previewWidth));
          return Math.abs(actualBlur - expectedBlur) < 0.0001;
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ---------------------------------------------------------------------------
// Task 4.4 — Property 4: Preview mode grain uses unscaled base size
// Validates: Requirements 4.3
// ---------------------------------------------------------------------------
describe('applyGrain — Property 4: preview mode uses unscaled base size', () => {
  it('preview blurRadius equals Math.max(0.5, preset.grainSize)', () => {
    fc.assert(
      fc.property(
        fc.record({
          grainIntensity: fc.float({ min: Math.fround(0.001), max: Math.fround(0.04), noNaN: true }),
          grainSize:      fc.float({ min: Math.fround(0.5), max: Math.fround(3.0), noNaN: true }),
          grainSeed:      fc.integer({ min: 0, max: 9999 }),
        }),
        (preset) => {
          const imageData = makeImageData(16, 16);

          const actualBlur = applyGrainAndCaptureBlur(imageData, preset, {
            mode: 'preview',
            previewWidth: 1024,
          });

          if (actualBlur === null) return false;

          const expectedBlur = Math.max(0.5, preset.grainSize);
          return Math.abs(actualBlur - expectedBlur) < 0.0001;
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ---------------------------------------------------------------------------
// Task 4.5 — Property 5: Export grain is visible for any non-zero intensity
// Validates: Requirements 4.4
// ---------------------------------------------------------------------------
describe('applyGrain — Property 5: export grain is visible for any non-zero intensity', () => {
  it('at least one pixel differs after applyGrain with non-zero intensity', () => {
    fc.assert(
      fc.property(
        fc.float({ min: Math.fround(0.008), max: Math.fround(0.04), noNaN: true }), // grainIntensity
        (intensity) => {
          const preset = { grainIntensity: intensity, grainSize: 1, grainSeed: 42 };
          const imageData = makeImageData(16, 16, 128, 128, 128);
          const before = new Uint8ClampedArray(imageData.data);

          applyGrain(imageData, preset, {
            mode: 'export',
            previewWidth: 1024,
            exportWidth: imageData.width,
          });

          // At least one pixel must differ
          for (let i = 0; i < before.length; i++) {
            if (imageData.data[i] !== before[i]) return true;
          }
          return false;
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ---------------------------------------------------------------------------
// Task 7.2 — Property 8: Grain Determinism
// ---------------------------------------------------------------------------
describe('applyGrain — property tests', () => {
  // Feature: grainframe-pipeline, Property 8: Grain Determinism
  it('same seed on identical ImageData produces identical output (Property 8)', () => {
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

    const presetArb = fc.record({
      grainIntensity: fc.float({ min: Math.fround(0.001), max: Math.fround(0.04), noNaN: true }),
      grainSize:      fc.integer({ min: 1, max: 3 }),
      grainSeed:      fc.integer({ min: 0, max: 2 ** 31 - 1 }),
    });

    fc.assert(
      fc.property(imageDataArb, presetArb, (imageData, preset) => {
        const copy1 = copyImageData(imageData);
        const copy2 = copyImageData(imageData);

        applyGrain(copy1, preset);
        applyGrain(copy2, preset);

        for (let i = 0; i < copy1.data.length; i++) {
          if (copy1.data[i] !== copy2.data[i]) return false;
        }
        return true;
      }),
      { numRuns: 100 },
    );
  });

  // Feature: grainframe-pipeline, Property 9: Grain Luminance Dependence
  it('darker pixels receive >= grain delta than brighter pixels (Property 9)', () => {
    const pixelPairArb = fc.record({
      darkR:   fc.integer({ min: 60,  max: 100 }),
      darkG:   fc.integer({ min: 60,  max: 100 }),
      darkB:   fc.integer({ min: 60,  max: 100 }),
      brightR: fc.integer({ min: 155, max: 195 }),
      brightG: fc.integer({ min: 155, max: 195 }),
      brightB: fc.integer({ min: 155, max: 195 }),
    }).filter(({ darkR, darkG, darkB, brightR, brightG, brightB }) => {
      const lumDark   = (0.299 * darkR   + 0.587 * darkG   + 0.114 * darkB)   / 255;
      const lumBright = (0.299 * brightR + 0.587 * brightG + 0.114 * brightB) / 255;
      return lumDark < lumBright;
    });

    const presetArb = fc.record({
      grainIntensity: fc.float({ min: Math.fround(0.01), max: Math.fround(0.04), noNaN: true }),
      grainSize:      fc.integer({ min: 1, max: 2 }),
      grainSeed:      fc.integer({ min: 0, max: 2 ** 31 - 1 }),
    });

    fc.assert(
      fc.property(pixelPairArb, presetArb, ({ darkR, darkG, darkB, brightR, brightG, brightB }, preset) => {
        const darkData = new Uint8ClampedArray([darkR, darkG, darkB, 255]);
        const brightData = new Uint8ClampedArray([brightR, brightG, brightB, 255]);

        const darkImg   = { data: darkData,   width: 1, height: 1 };
        const brightImg = { data: brightData, width: 1, height: 1 };

        applyGrain(darkImg,   preset);
        applyGrain(brightImg, preset);

        const deltaDark   = Math.abs(darkImg.data[1]   - darkG);
        const deltaBright = Math.abs(brightImg.data[1] - brightG);

        return deltaDark >= deltaBright;
      }),
      { numRuns: 100 },
    );
  });

  // Feature: grainframe-pipeline, Property 10: Grain Channel Asymmetry
  it('grain magnitude on R and B channels >= grain magnitude on G channel (Property 10)', () => {
    const imageDataArb = fc.record({
      width:  fc.integer({ min: 2, max: 16 }),
      height: fc.integer({ min: 2, max: 16 }),
    }).chain(({ width, height }) =>
      fc.array(
        fc.tuple(
          fc.integer({ min: 20, max: 235 }),
          fc.integer({ min: 20, max: 235 }),
          fc.integer({ min: 20, max: 235 }),
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
      grainIntensity: fc.float({ min: Math.fround(0.01), max: Math.fround(0.04), noNaN: true }),
      grainSize:      fc.integer({ min: 1, max: 2 }),
      grainSeed:      fc.integer({ min: 0, max: 2 ** 31 - 1 }),
    });

    fc.assert(
      fc.property(imageDataArb, presetArb, (imageData, preset) => {
        const original = new Uint8ClampedArray(imageData.data);
        applyGrain(imageData, preset);

        for (let i = 0; i < original.length; i += 4) {
          const deltaR = Math.abs(imageData.data[i]     - original[i]);
          const deltaG = Math.abs(imageData.data[i + 1] - original[i + 1]);
          const deltaB = Math.abs(imageData.data[i + 2] - original[i + 2]);

          if (deltaR < deltaG) return false;
          if (deltaB < deltaG) return false;
        }
        return true;
      }),
      { numRuns: 100 },
    );
  });

  // Feature: grainframe-pipeline, Property 11: Grain Intensity Clamp
  it('absolute channel delta never exceeds ceil(0.04 * 255) = 11 (Property 11)', () => {
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

    const presetArb = fc.record({
      grainIntensity: fc.float({ min: Math.fround(0), max: Math.fround(1.0), noNaN: true }),
      grainSize:      fc.integer({ min: 1, max: 2 }),
      grainSeed:      fc.integer({ min: 0, max: 2 ** 31 - 1 }),
    });

    const MAX_DELTA = Math.ceil(0.04 * 255); // = 11

    fc.assert(
      fc.property(imageDataArb, presetArb, (imageData, preset) => {
        const original = new Uint8ClampedArray(imageData.data);
        applyGrain(imageData, preset);

        for (let i = 0; i < original.length; i += 4) {
          for (let ch = 0; ch < 3; ch++) {
            const delta = Math.abs(imageData.data[i + ch] - original[i + ch]);
            if (delta > MAX_DELTA) return false;
          }
        }
        return true;
      }),
      { numRuns: 100 },
    );
  });
});
