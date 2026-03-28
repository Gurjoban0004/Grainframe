import '../styles/PresetSelector.css';

const EMPTY_THUMBNAILS = new Map();
const EMPTY_MAP = new Map();

function PresetCard({ preset, thumbnail, isActive, onSelect, isReady }) {
  return (
    <button
      className={`preset-card${isActive ? ' preset-card--active' : ''}`}
      onClick={() => onSelect(preset.id)}
      aria-label={`Apply ${preset.name} preset`}
      aria-pressed={isActive}
    >
      {thumbnail
        ? <img src={thumbnail} className="preset-thumbnail" alt="" />
        : <div className="preset-thumbnail preset-thumbnail--empty" />
      }
      <span className="preset-name">{preset.name}</span>
      {isReady && !isActive && <div className="preset-ready-dot" />}
    </button>
  );
}

function getOrderedPresets(presets, favoriteIds) {
  const favSet = new Set(favoriteIds);
  const favorites = favoriteIds.map(id => presets.find(p => p.id === id)).filter(Boolean);
  const rest = presets.filter(p => !favSet.has(p.id));
  return { favorites, rest };
}

export default function PresetSelector({
  presets,
  activePresetId,
  onSelect,
  thumbnails = EMPTY_THUMBNAILS,
  favorites = [],
  readyPresets = EMPTY_MAP,
}) {
  const { favorites: favPresets, rest } = getOrderedPresets(presets, favorites);
  const hasFavorites = favPresets.length > 0;

  return (
    <div role="toolbar" className="preset-strip" aria-label="Presets">
      {hasFavorites && (
        <>
          {favPresets.map(preset => (
            <PresetCard
              key={`fav-${preset.id}`}
              preset={preset}
              thumbnail={thumbnails.get(preset.id)}
              isActive={preset.id === activePresetId}
              onSelect={onSelect}
              isReady={readyPresets.has(preset.id)}
            />
          ))}
          <div className="preset-divider" aria-hidden="true" />
        </>
      )}
      {rest.map(preset => (
        <PresetCard
          key={preset.id}
          preset={preset}
          thumbnail={thumbnails.get(preset.id)}
          isActive={preset.id === activePresetId}
          onSelect={onSelect}
          isReady={readyPresets.has(preset.id)}
        />
      ))}
    </div>
  );
}
