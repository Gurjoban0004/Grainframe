import '../styles/PresetSelector.css';

export default function PresetSelector({ presets, activePresetId, onSelect, isProcessing }) {
  return (
    <div role="toolbar" className="preset-strip" aria-label="Presets">
      {presets.map((preset) => {
        const isActive = preset.id === activePresetId;
        let className = 'preset-pill';
        if (isActive) className += ' preset-pill--active';
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
  );
}
