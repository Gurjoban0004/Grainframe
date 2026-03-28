import { describe, it, expect } from 'vitest';
import classicChrome from '../../presets/classic-chrome.json';

describe('Classic Chrome preset', () => {
  describe('required fields are present', () => {
    it('has rMult as a number', () => {
      expect(typeof classicChrome.rMult).toBe('number');
    });

    it('has gMult as a number', () => {
      expect(typeof classicChrome.gMult).toBe('number');
    });

    it('has bMult as a number', () => {
      expect(typeof classicChrome.bMult).toBe('number');
    });

    it('has saturation as a number', () => {
      expect(typeof classicChrome.saturation).toBe('number');
    });

    it('has warmth as a number', () => {
      expect(typeof classicChrome.warmth).toBe('number');
    });

    it('has vignetteIntensity as a number', () => {
      expect(typeof classicChrome.vignetteIntensity).toBe('number');
    });

    it('has toneCurve as an object', () => {
      expect(typeof classicChrome.toneCurve).toBe('object');
      expect(classicChrome.toneCurve).not.toBeNull();
    });

    it('has toneCurve.rgb as an array', () => {
      expect(Array.isArray(classicChrome.toneCurve.rgb)).toBe(true);
    });

    it('has grainIntensity as a number', () => {
      expect(typeof classicChrome.grainIntensity).toBe('number');
    });

    it('has grainSize as a number', () => {
      expect(typeof classicChrome.grainSize).toBe('number');
    });

    it('has grainSeed as a number', () => {
      expect(typeof classicChrome.grainSeed).toBe('number');
    });

    it('has sharpenAmount as a number', () => {
      expect(typeof classicChrome.sharpenAmount).toBe('number');
    });
  });

  describe('field value ranges', () => {
    it('vignetteIntensity is in [0, 1]', () => {
      expect(classicChrome.vignetteIntensity).toBeGreaterThanOrEqual(0);
      expect(classicChrome.vignetteIntensity).toBeLessThanOrEqual(1);
    });

    it('grainIntensity is in [0.01, 0.04]', () => {
      expect(classicChrome.grainIntensity).toBeGreaterThanOrEqual(0.01);
      expect(classicChrome.grainIntensity).toBeLessThanOrEqual(0.04);
    });

    it('sharpenAmount is in [0, 0.3]', () => {
      expect(classicChrome.sharpenAmount).toBeGreaterThanOrEqual(0);
      expect(classicChrome.sharpenAmount).toBeLessThanOrEqual(0.3);
    });
  });

  // Requirement 12.1: lifted blacks and compressed highlights
  describe('tone curve — lifted blacks and compressed highlights', () => {
    it('shadow output (first rgb control point y-value) is > 0 (lifted blacks)', () => {
      const firstPoint = classicChrome.toneCurve.rgb[0];
      const shadowOutput = firstPoint[1];
      expect(shadowOutput).toBeGreaterThan(0);
    });

    it('highlight output (last rgb control point y-value) is < 255 (compressed highlights)', () => {
      const lastPoint = classicChrome.toneCurve.rgb[classicChrome.toneCurve.rgb.length - 1];
      const highlightOutput = lastPoint[1];
      expect(highlightOutput).toBeLessThan(255);
    });
  });
});
