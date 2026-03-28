import { useState, useEffect } from 'react';
import PresetSelector from './PresetSelector.jsx';
import '../styles/BatchView.css';

const EMPTY_MAP = new Map();

export default function BatchView({
  photos,
  activePreset,
  onCancel,
  onExportAll,
  onSelectPreset,
  presets,
  isExporting,
  exportProgress,
  exportComplete,
}) {
  const [showToast, setShowToast] = useState(false);

  // Show toast when export completes, auto-dismiss after 4s
  useEffect(() => {
    if (exportComplete) {
      setShowToast(true);
      const t = setTimeout(() => setShowToast(false), 4000);
      return () => clearTimeout(t);
    }
  }, [exportComplete]);

  return (
    <div className="batch-view">
      <div className="batch-top-bar">
        <button
          className="batch-cancel"
          onClick={onCancel}
          disabled={isExporting}
          aria-label="Cancel batch"
        >
          Cancel
        </button>
        <span className="batch-count" aria-live="polite">
          Batch ({photos.length})
        </span>
        <button
          className="batch-export-all"
          onClick={onExportAll}
          disabled={isExporting || photos.every(p => p.status === 'loading')}
          aria-label="Export all photos"
        >
          {isExporting
            ? `${exportProgress.current}/${exportProgress.total}`
            : 'Export All'}
        </button>
      </div>

      {showToast && <ExportCompleteToast />}

      <div className="batch-grid" role="list" aria-label="Batch photos">
        {photos.map(photo => (
          <div key={photo.id} className="batch-item" role="listitem">
            {photo.thumbnail ? (
              <img src={photo.thumbnail} className="batch-thumb" alt="" />
            ) : (
              <div className="batch-thumb-loading" aria-hidden="true" />
            )}
            {photo.status === 'processing' && (
              <div className="batch-item-processing" aria-label="Processing" />
            )}
            {photo.status === 'exported' && (
              <div className="batch-item-done" aria-label="Exported">✓</div>
            )}
            {photo.status === 'error' && (
              <div className="batch-item-error" aria-label="Error">!</div>
            )}
          </div>
        ))}
      </div>

      <div className="batch-preset-strip">
        <PresetSelector
          presets={presets}
          activePresetId={activePreset.id}
          onSelect={onSelectPreset}
          isProcessing={false}
          thumbnails={EMPTY_MAP}
          favorites={[]}
        />
      </div>
    </div>
  );
}

function isIOS() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
}

function ExportCompleteToast() {
  const msg = isIOS()
    ? 'Photos saved to Files → Downloads'
    : 'Photos downloaded';
  return (
    <div className="batch-complete-toast" role="status" aria-live="polite">
      {msg}
    </div>
  );
}
