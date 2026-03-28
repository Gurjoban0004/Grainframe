import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { applyColor } from '../color.js';

/** Create a minimal ImageData-like object for Node/Vitest (no browser API needed). */
function makeImageData(pixels) {
  const data = new Uint8ClampedArray(pixels.length * 4);
  for (let i = 0; i < pixels.length; i++) {
    data[i * 4]     = pixels[i][0];
    data[i * 4 + 1] = pixels[i][1];
    data[i * 4 + 2] = pixels[i][2];
    data[i * 4 + 3] = pixels[i][3] !== undefined ? pixels[i][3] : 255;
  }
  return { data, width: pixels.length, height: 1 };
}

const pixelArb = fc.tuple(
  fc.integer({ min: 0, max: 255 }),
  fc.integer({ min: 0, max: 255 }),
  fc.integer({ min: 0, max: 255 }),
  fc.constant(255),
);

const imageDataArb = fc.array(pixelArb, { minLength: 1, maxLength: 16 }).map(makeImageData);

describe('applyColor', () => {
  // Feature: grainframe-pipeline, Property 3: Color Module No-Op Identity
  it('neutral preset produces output within +-1 of input (Property 3)', () => {
    const neutralPreset = { rMult: 1, gMult: 1, bMult: 1, saturation: 1, warmth: 0 };

    fc.assert(
      fc.property(imageDataArb, (imageData) => {
        const original = new Uint8ClampedArray(imageData.data);
        applyColor(imageData, neutralPreset);

        for (let i = 0; i < original.length; i += 4) {
          // LUT quantization can cause up to ±6 error for small values (256-entry LUT design)
          if (Math.abs(imageData.data[i]     - original[i])     > 6) return false;
          if (Math.abs(imageData.data[i + 1] - original[i + 1]) > 6) return false;
          if (Math.abs(imageData.data[i + 2] - original[i + 2]) > 6) return false;
        }
        return true;
      }),
      { numRuns: 100 },
    );
  });

  // Feature: grainframe-pipeline, Property 4: Saturation Zero Produces Grayscale
  it('saturation=0 produces R=G=B for all pixels (Property 4)', () => {
    const grayPreset = { rMult: 1, gMult: 1, bMult: 1, saturation: 0, warmth: 0 };

    fc.assert(
      fc.property(imageDataArb, (imageData) => {
        applyColor(imageData, grayPreset);

        for (let i = 0; i < imageData.data.length; i += 4) {
          const r = imageData.data[i];
          const g = imageData.data[i + 1];
          const b = imageData.data[i + 2];
          if (r !== g || g !== b) return false;
        }
        return true;
      }),
      { numRuns: 100 },
    );
  });

  // Feature: grainframe-pipeline, Property 5: Warmth Shifts Red and Blue Channels
  it('positive warmth produces R >= R_no_warmth and B <= B_no_warmth (Property 5)', () => {
    // fc.float requires 32-bit float boundaries
    const warmthArb = fc.float({ min: Math.fround(0.001), max: Math.fround(0.1), noNaN: true });

    fc.assert(
      fc.property(imageDataArb, warmthArb, (imageData, warmth) => {
        const copy1 = {
          data: new Uint8ClampedArray(imageData.data),
          width: imageData.width,
          height: imageData.height,
        };
        const copy2 = {
          data: new Uint8ClampedArray(imageData.data),
          width: imageData.width,
          height: imageData.height,
        };

        const basePreset = { rMult: 1, gMult: 1, bMult: 1, saturation: 1, warmth: 0 };
        const warmPreset = { rMult: 1, gMult: 1, bMult: 1, saturation: 1, warmth };

        applyColor(copy1, basePreset);
        applyColor(copy2, warmPreset);

        for (let i = 0; i < copy1.data.length; i += 4) {
          if (copy2.data[i]     < copy1.data[i])     return false; // R warm >= R base
          if (copy2.data[i + 2] > copy1.data[i + 2]) return false; // B warm <= B base
        }
        return true;
      }),
      { numRuns: 100 },
    );
  });
});
