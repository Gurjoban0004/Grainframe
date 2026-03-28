import { useEffect, useState } from 'react';
import classicChrome from './presets/classic-chrome.json';
import portra from './presets/portra.json';
import silver from './presets/silver.json';
import softFilm from './presets/soft-film.json';
import golden from './presets/golden.json';
import faded from './presets/faded.json';
import velvia from './presets/velvia.json';
import cinema from './presets/cinema.json';
import { validatePreset } from './utils/presets.js';
import { useCamera } from './hooks/useCamera.js';
import { useImagePipeline } from './hooks/useImagePipeline.js';
import CameraView from './components/CameraView.jsx';
import ExportButton from './components/ExportButton.jsx';
import PresetSelector from './components/PresetSelector.jsx';
import CompareButton from './components/CompareButton.jsx';
import ErrorBanner from './components/ErrorBanner.jsx';
import UpdateToast from './components/UpdateToast.jsx';
import './styles/App.css';

const PRESETS = [classicChrome, portra, silver, softFilm, golden, faded, velvia, cinema];

export default function App() {
  const {
    captureRef,
    importRef,
    handleFileChange,
    triggerImport,
    previewImageData,
    fullImageData,
    error: cameraError,
  } = useCamera();

  const {
    preview,
    isProcessing,
    error: pipelineError,
    processPreview,
    processExport,
  } = useImagePipeline();

  const [activePreset, setActivePreset] = useState(classicChrome);
  const [showOriginal, setShowOriginal] = useState(false);

  // On new photo load: reset to classicChrome and process
  useEffect(() => {
    if (previewImageData) {
      setActivePreset(classicChrome);
      processPreview(previewImageData, classicChrome);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previewImageData]);

  function handleSelectPreset(id) {
    const preset = PRESETS.find(p => p.id === id);
    validatePreset(preset);
    setActivePreset(preset);
    processPreview(previewImageData, preset);
  }

  const activeError = cameraError || pipelineError;
  const [dismissed, setDismissed] = useState(false);
  useEffect(() => { if (activeError) setDismissed(false); }, [activeError]);
  const visibleError = dismissed ? null : activeError;

  const [exportError, setExportError] = useState(null);
  const [exportDismissed, setExportDismissed] = useState(false);
  useEffect(() => { if (exportError) setExportDismissed(false); }, [exportError]);

  const finalError = exportDismissed ? null : (exportError || visibleError);

  function handleRetry() {
    if (exportError) setExportError(null);
    else triggerImport();
  }

  function handleDismiss() {
    if (exportError) setExportDismissed(true);
    else setDismissed(true);
  }

  const hasImage = !!previewImageData;

  return (
    <div className="app">
      {/* ── Preview area — fills all available space ── */}
      <div className="preview-area">
        <CameraView
          captureRef={captureRef}
          importRef={importRef}
          handleFileChange={handleFileChange}
          preview={preview}
          previewImageData={previewImageData}
          isProcessing={isProcessing}
          showOriginal={showOriginal}
        >
          {/* Top overlay: ORIGINAL + Export float over the image */}
          {hasImage && (
            <div className="top-overlay">
              <CompareButton
                onPressStart={() => setShowOriginal(true)}
                onPressEnd={() => setShowOriginal(false)}
                visible={!!preview}
              />
              <ExportButton
                fullImageData={fullImageData}
                processExport={processExport}
                preset={activePreset}
                onError={setExportError}
              />
            </div>
          )}
        </CameraView>
      </div>

      {/* ── Controls column: display:contents in portrait, flex column in landscape ── */}
      <div className="controls-column">
        {/* Preset strip — only when image loaded */}
        {hasImage && (
          <div className="preset-strip-wrapper">
            <PresetSelector
              presets={PRESETS}
              activePresetId={activePreset.id}
              onSelect={handleSelectPreset}
              isProcessing={isProcessing}
            />
          </div>
        )}

        {/* Action bar — always shown */}
        <div className="action-bar">
          <div className="action-bar-side action-bar-left">
            <button
              className="gallery-btn"
              aria-label="Import from library"
              onClick={() => importRef.current?.click()}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <rect x="3" y="3" width="7" height="7" rx="1" fill="currentColor" opacity="0.8" />
                <rect x="14" y="3" width="7" height="7" rx="1" fill="currentColor" opacity="0.8" />
                <rect x="3" y="14" width="7" height="7" rx="1" fill="currentColor" opacity="0.8" />
                <rect x="14" y="14" width="7" height="7" rx="1" fill="currentColor" opacity="0.8" />
              </svg>
            </button>
          </div>

          <div className="action-bar-center">
            <button
              className="capture-btn"
              aria-label="Take photo"
              onClick={() => captureRef.current?.click()}
            >
              <span className="capture-btn-inner" />
            </button>
          </div>

          <div className="action-bar-side action-bar-right" />
        </div>
      </div>

      <ErrorBanner
        error={finalError}
        onRetry={handleRetry}
        onDismiss={handleDismiss}
      />
      <UpdateToast />
    </div>
  );
}
