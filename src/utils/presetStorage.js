const STORAGE_KEY = 'grainframe_preset_usage';

export function getPresetUsage() {
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    return data ? JSON.parse(data) : {};
  } catch {
    return {};
  }
}

export function recordPresetUsage(presetId) {
  const usage = getPresetUsage();
  usage[presetId] = (usage[presetId] || 0) + 1;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(usage));
  } catch {
    // localStorage full or unavailable — silently fail
  }
}

export function getFavoritePresets(allPresetIds, maxFavorites = 3) {
  const usage = getPresetUsage();
  return allPresetIds
    .filter(id => (usage[id] || 0) >= 3)
    .sort((a, b) => (usage[b] || 0) - (usage[a] || 0))
    .slice(0, maxFavorites);
}
