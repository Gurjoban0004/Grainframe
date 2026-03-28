import { describe, it, expect } from 'vitest';
import { validatePreset, REQUIRED_PRESET_FIELDS } from '../presets.js';
import classicChrome from '../../presets/classic-chrome.json';

const validPreset = classicChrome;

describe('validatePreset', () => {
  it('passes for a valid preset', () => {
    expect(() => validatePreset(validPreset)).not.toThrow();
  });

  it('throws when a required field is missing', () => {
    for (const field of REQUIRED_PRESET_FIELDS) {
      const bad = { ...validPreset };
      delete bad[field];
      expect(() => validatePreset(bad)).toThrow(`Preset missing field: ${field}`);
    }
  });

  it('throws when toneCurve is missing entirely', () => {
    const bad = { ...validPreset, toneCurve: undefined };
    expect(() => validatePreset(bad)).toThrow('Preset missing toneCurve channels');
  });

  it('throws when a toneCurve channel is missing', () => {
    for (const ch of ['r', 'g', 'b']) {
      const bad = { ...validPreset, toneCurve: { ...validPreset.toneCurve, [ch]: undefined } };
      expect(() => validatePreset(bad)).toThrow('Preset missing toneCurve channels');
    }
  });
});
