import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { buildToneCurveLUTs } from '../tonecurve.js';

// --- Unit Tests (Task 4.1) ---

describe('buildToneCurveLUTs', () => {
  it('identity curve [[0,0],[255,255]] maps endpoints correctly and is non-decreasing', () => {
    // Catmull-Rom spline with 2 control points: endpoints are exact (0→0, 255→255),
    // the LUT is non-decreasing, and all values stay in [0, 255].
    const preset = { toneCurve: { rgb: [[0, 0], [255, 255]] } };
    const luts = buildToneCurveLUTs(preset);
    for (const lut of [luts.r, luts.g, luts.b]) {
      expect(lut[0]).toBe(0);
      expect(lut[255]).toBe(255);
      for (let i = 1; i < 256; i++) {
        expect(lut[i]).toBeGreaterThanOrEqual(lut[i - 1]);
      }
    }
  });

  it('returns an object with r, g, b Uint8Arrays of length 256', () => {
    const preset = { toneCurve: { rgb: [[0, 0], [255, 255]] } };
    const luts = buildToneCurveLUTs(preset);
    expect(luts).toHaveProperty('r');
    expect(luts).toHaveProperty('g');
    expect(luts).toHaveProperty('b');
    expect(luts.r).toBeInstanceOf(Uint8Array);
    expect(luts.g).toBeInstanceOf(Uint8Array);
    expect(luts.b).toBeInstanceOf(Uint8Array);
    expect(luts.r.length).toBe(256);
    expect(luts.g.length).toBe(256);
    expect(luts.b.length).toBe(256);
  });
});

// --- Property-Based Test (Task 4.2) ---

// Feature: grainframe-pipeline, Property 2: Tone Curve LUT Validity
describe('Tone Curve LUT Validity (Property 2)', () => {
  // Validates: Requirements 3.1, 3.2
  it('any control points produce a 256-entry non-decreasing LUT with values in [0,255]', () => {
    // Generator: sorted array of [x, y] control points with x, y in [0, 255]
    const controlPointsArb = fc
      .array(
        fc.tuple(fc.integer({ min: 0, max: 255 }), fc.integer({ min: 0, max: 255 })),
        { minLength: 2, maxLength: 10 },
      )
      .map((pts) => {
        // Sort by x and deduplicate x values to form valid control points
        const sorted = [...pts].sort((a, b) => a[0] - b[0]);
        const deduped = sorted.filter((pt, i) => i === 0 || pt[0] !== sorted[i - 1][0]);
        return deduped.length >= 2 ? deduped : [[0, 0], [255, 255]];
      });

    fc.assert(
      fc.property(controlPointsArb, (points) => {
        const preset = { toneCurve: { rgb: points } };
        const luts = buildToneCurveLUTs(preset);

        for (const lut of [luts.r, luts.g, luts.b]) {
          // (a) exactly 256 entries
          if (lut.length !== 256) return false;

          for (let i = 0; i < 256; i++) {
            // (b) values in [0, 255]
            if (lut[i] < 0 || lut[i] > 255) return false;
            // (c) non-decreasing
            if (i > 0 && lut[i] < lut[i - 1]) return false;
          }
        }
        return true;
      }),
      { numRuns: 100 },
    );
  });
});
