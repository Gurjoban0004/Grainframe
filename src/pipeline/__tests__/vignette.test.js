import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { applyVignette } from '../vignette.js';

/** Create a minimal ImageData-like object for Node/Vitest (no browser API needed). */
function makeImageData(width, height, fillValue = 200) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    data[i * 4]     = fillValue;
    data[i * 4 + 1] = fillValue;
    data[i * 4 + 2] = fillValue;
    data[i * 4 + 3] = 255;
  }
  return { data, width, height };
}

describe('applyVignette', () => {
  // Unit test: vignetteIntensity=0 leaves all pixels unchanged
  it('vignetteIntensity=0 leaves all pixels unchanged', () => {
    const imageData = makeImageData(64, 64, 128);
    const original = new Uint8ClampedArray(imageData.data);

    applyVignette(imageData, { vignetteIntensity: 0 });

    for (let i = 0; i < original.length; i++) {
      expect(imageData.data[i]).toBe(original[i]);
    }
  });

  // Unit test: center pixel is not darkened
  it('center pixel is not darkened (falloff=0 at center)', () => {
    const width = 64, height = 64;
    const imageData = makeImageData(width, height, 200);

    applyVignette(imageData, { vignetteIntensity: 1.0 });

    // Center pixel index
    const cx = Math.floor(width / 2);
    const cy = Math.floor(height / 2);
    const i = (cy * width + cx) * 4;

    // Center is within inner radius, so falloff=0 → pixel unchanged
    expect(imageData.data[i]).toBe(200);
    expect(imageData.data[i + 1]).toBe(200);
    expect(imageData.data[i + 2]).toBe(200);
  });

  // Feature: grainframe-pipeline, Property 6: Vignette Only Darkens
  it('vignette only darkens — every output channel <= input channel (Property 6)', () => {
    const pixelArb = fc.tuple(
      fc.integer({ min: 0, max: 255 }),
      fc.integer({ min: 0, max: 255 }),
      fc.integer({ min: 0, max: 255 }),
    );

    const imageDataArb = fc.record({
      width:  fc.integer({ min: 2, max: 32 }),
      height: fc.integer({ min: 2, max: 32 }),
    }).chain(({ width, height }) =>
      fc.array(pixelArb, { minLength: width * height, maxLength: width * height }).map(pixels => {
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

    const intensityArb = fc.float({ min: 0, max: 1, noNaN: true });

    fc.assert(
      fc.property(imageDataArb, intensityArb, (imageData, vignetteIntensity) => {
        const original = new Uint8ClampedArray(imageData.data);
        applyVignette(imageData, { vignetteIntensity });

        for (let i = 0; i < original.length; i += 4) {
          if (imageData.data[i]     > original[i])     return false;
          if (imageData.data[i + 1] > original[i + 1]) return false;
          if (imageData.data[i + 2] > original[i + 2]) return false;
        }
        return true;
      }),
      { numRuns: 100 },
    );
  });

  // Feature: grainframe-pipeline, Property 7: Vignette Corner Cap
  it('vignetteIntensity=1.0 darkens corners by no more than 25% (Property 7)', () => {
    const imageDataArb = fc.record({
      width:  fc.integer({ min: 4, max: 64 }),
      height: fc.integer({ min: 4, max: 64 }),
      fill:   fc.integer({ min: 100, max: 255 }),
    }).map(({ width, height, fill }) => ({
      imageData: makeImageData(width, height, fill),
      fill,
      width,
      height,
    }));

    fc.assert(
      fc.property(imageDataArb, ({ imageData, fill, width, height }) => {
        applyVignette(imageData, { vignetteIntensity: 1.0 });

        // Check all four corners
        const corners = [
          { x: 0,          y: 0 },
          { x: width - 1,  y: 0 },
          { x: 0,          y: height - 1 },
          { x: width - 1,  y: height - 1 },
        ];

        for (const { x, y } of corners) {
          const i = (y * width + x) * 4;
          for (let ch = 0; ch < 3; ch++) {
            const out = imageData.data[i + ch];
            // Output must be >= 75% of input (darkened by no more than 25%)
            const minAllowed = Math.floor(fill * 0.75);
            if (out < minAllowed) return false;
          }
        }
        return true;
      }),
      { numRuns: 100 },
    );
  });
});
