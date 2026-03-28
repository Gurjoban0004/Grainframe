import '../styles/PresetSelector.css';

export default function PresetSelector({ presets, activePresetId, onSelect, isProcessing, visible }) {
  if (!visible) return null;

  return (
    <div role="toolbar" className="preset-selector">
      <div className="preset-selector__scroll">
        {presets.map((preset) => {
          const isActive = preset.id === activePresetId;
          let className = 'preset-selector__pill';
          if (isActive) className += ' pill--active';
          if (isActive && isProcessing) className += ' processing';

          return (
            <button
              key={preset.id}
              className={className}
              onClick={() => onSelect(preset.id)}
              aria-pressed={isActive}
              aria-label={`Select ${preset.name} preset`}
            >
              {preset.name}
            </button>
          );
        })}
      </div>
    </div>
  );
}
