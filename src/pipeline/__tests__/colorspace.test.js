import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { srgbToLinearLUT, linearToSrgbLUT } from '../colorspace.js';

describe('colorspace LUTs', () => {
  it('srgbToLinearLUT[0] === 0', () => {
    expect(srgbToLinearLUT[0]).toBe(0);
  });

  it('srgbToLinearLUT[255] ≈ 1 (within 0.001)', () => {
    expect(srgbToLinearLUT[255]).toBeCloseTo(1, 3);
  });

  it('srgbToLinearLUT has exactly 256 entries', () => {
    expect(srgbToLinearLUT.length).toBe(256);
  });

  it('linearToSrgbLUT has exactly 4096 entries', () => {
    expect(linearToSrgbLUT.length).toBe(4096);
  });
});

describe('colorspace properties', () => {
  // Feature: grainframe-pipeline, Property 1: Color Space Round-Trip
  it('sRGB round-trip stays within ±1', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 255 }), (v) => {
        const linear = srgbToLinearLUT[v];
        const back = linearToSrgbLUT[Math.round(linear * 4095)];
        return Math.abs(back - v) <= 1;
      }),
      { numRuns: 256 }
    );
  });
});
