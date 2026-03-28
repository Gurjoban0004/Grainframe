import { useRef, useEffect } from 'react';
import '../styles/PresetSelector.css';

const EMPTY_THUMBNAILS = new Map();

function PresetCard({ preset, thumbnail, isActive, onSelect }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    if (!thumbnail || !canvasRef.current) return;
    const canvas = canvasRef.current;
    canvas.width = thumbnail.width;
    canvas.height = thumbnail.height;
    const ctx = canvas.getContext('2d');
    ctx.putImageData(thumbnail, 0, 0);
  }, [thumbnail]);

  return (
    <button
      className={`preset-card${isActive ? ' preset-card--active' : ''}`}
      onClick={() => onSelect(preset.id)}
      aria-label={`Apply ${preset.name} preset`}
      aria-pressed={isActive}
    >
      <canvas ref={canvasRef} className="preset-thumbnail" />
      <span className="preset-name">{preset.name}</span>
    </button>
  );
}

function getOrderedPresets(presets, favoriteIds) {
  const favSet = new Set(favoriteIds);
  const favorites = favoriteIds.map(id => presets.find(p => p.id === id)).filter(Boolean);
  const rest = presets.filter(p => !favSet.has(p.id));
  return { favorites, rest };
}

export default function PresetSelector({ presets, activePresetId, onSelect, thumbnails = EMPTY_THUMBNAILS, favorites = [] }) {
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
        />
      ))}
    </div>
  );
}
