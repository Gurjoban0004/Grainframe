export const REQUIRED_PRESET_FIELDS = [
  'id', 'name', 'rMult', 'gMult', 'bMult', 'saturation', 'warmth',
  'vignetteIntensity', 'grainIntensity', 'grainSize', 'grainSeed',
  'sharpenAmount'
];

export function validatePreset(preset) {
  for (const field of REQUIRED_PRESET_FIELDS) {
    if (preset[field] === undefined) throw new Error(`Preset missing field: ${field}`);
  }
  if (!preset.toneCurve?.r || !preset.toneCurve?.g || !preset.toneCurve?.b) {
    throw new Error('Preset missing toneCurve channels');
  }
}
