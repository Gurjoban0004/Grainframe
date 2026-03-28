import { useEffect, useState } from 'react';
import classicChrome from './presets/classic-chrome.json';
import softFilm from './presets/soft-film.json';
import velvia from './presets/velvia.json';
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

// Requirements: 4.3, 4.4, 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 8.1, 8.3, 13.1, 13.7, 15.1, 15.2

const PRESETS = [classicChrome, softFilm, velvia];

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

  // On new photo load: reset to classicChrome and process (Req 15.1, 7.3)
  useEffect(() => {
    if (previewImageData) {
      setActivePreset(classicChrome);
      processPreview(previewImageData, classicChrome);
    }
  }, [previewImageData]);

  function handleSelectPreset(id) {
    const preset = PRESETS.find(p => p.id === id);
    validatePreset(preset);
    setActivePreset(preset);
    processPreview(previewImageData, preset);
  }

  // Merge errors — camera errors take priority (Req 13.1)
  const activeError = cameraError || pipelineError;

  function onRetry() {
    triggerImport();
  }

  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (activeError) setDismissed(false);
  }, [activeError]);

  const visibleError = dismissed ? null : activeError;

  function onDismiss() {
    setDismissed(true);
  }

  const [exportError, setExportError] = useState(null);
  const [exportDismissed, setExportDismissed] = useState(false);

  function onError(err) {
    setExportError(err);
  }

  useEffect(() => {
    if (exportError) setExportDismissed(false);
  }, [exportError]);

  const finalError = exportDismissed ? null : (exportError || visibleError);

  function handleRetry() {
    if (exportError) {
      setExportError(null);
    } else {
      onRetry();
    }
  }

  function handleDismiss() {
    if (exportError) {
      setExportDismissed(true);
    } else {
      onDismiss();
    }
  }

  return (
    <div className="app">
      <CameraView
        captureRef={captureRef}
        importRef={importRef}
        handleFileChange={handleFileChange}
        preview={preview}
        previewImageData={previewImageData}
        isProcessing={isProcessing}
        showOriginal={showOriginal}
      >
        <CompareButton
          onPressStart={() => setShowOriginal(true)}
          onPressEnd={() => setShowOriginal(false)}
          visible={!!preview}
        />
      </CameraView>
      <PresetSelector
        presets={PRESETS}
        activePresetId={activePreset.id}
        onSelect={handleSelectPreset}
        isProcessing={isProcessing}
        visible={!!preview}
      />
      <div className="action-bar">
        <button
          className="import-btn"
          aria-label="Import from library"
          onClick={() => importRef.current?.click()}
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <rect x="3" y="3" width="7" height="7" rx="1" fill="currentColor" opacity="0.8" />
            <rect x="14" y="3" width="7" height="7" rx="1" fill="currentColor" opacity="0.8" />
            <rect x="3" y="14" width="7" height="7" rx="1" fill="currentColor" opacity="0.8" />
            <rect x="14" y="14" width="7" height="7" rx="1" fill="currentColor" opacity="0.8" />
          </svg>
        </button>
        <button
          className="capture-btn"
          aria-label="Take photo"
          onClick={() => captureRef.current?.click()}
        />
      </div>
      <ExportButton
        fullImageData={fullImageData}
        processExport={processExport}
        preset={activePreset}
        onError={onError}
      />
      <ErrorBanner
        error={finalError}
        onRetry={handleRetry}
        onDismiss={handleDismiss}
      />
      <UpdateToast />
    </div>
  );
}
