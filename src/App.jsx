import { useEffect, useState, useRef } from 'react';
import classicChrome from './presets/classic-chrome.json';
import portra from './presets/portra.json';
import silver from './presets/silver.json';
import softFilm from './presets/soft-film.json';
import golden from './presets/golden.json';
import faded from './presets/faded.json';
import velvia from './presets/velvia.json';
import cinema from './presets/cinema.json';
import { validatePreset } from './utils/presets.js';
import { recordPresetUsage, getFavoritePresets } from './utils/presetStorage.js';
import { applyCrop } from './utils/crop.js';
import { useCamera } from './hooks/useCamera.js';
import { useImagePipeline } from './hooks/useImagePipeline.js';
import { useThumbnails } from './hooks/useThumbnails.js';
import { usePresetHistory } from './hooks/usePresetHistory.js';
import { useBatchProcessing, MAX_BATCH } from './hooks/useBatchProcessing.js';
import { usePresetCache } from './hooks/usePresetCache.js';
import { saveLastPhoto } from './utils/lastPhoto.js';
import CameraView from './components/CameraView.jsx';
import ExportButton from './components/ExportButton.jsx';
import PresetSelector from './components/PresetSelector.jsx';
import CompareButton from './components/CompareButton.jsx';
import CropOverlay from './components/CropOverlay.jsx';
import BatchView from './components/BatchView.jsx';
import ErrorBanner from './components/ErrorBanner.jsx';
import UpdateToast from './components/UpdateToast.jsx';
import './styles/App.css';

const PRESETS = [classicChrome, portra, silver, softFilm, golden, faded, velvia, cinema];
const PRESET_IDS = PRESETS.map(p => p.id);

function getDefaultPreset() {
  const favIds = getFavoritePresets(PRESET_IDS, 1);
  if (favIds.length > 0) {
    const fav = PRESETS.find(p => p.id === favIds[0]);
    if (fav) return fav;
  }
  return classicChrome;
}

export default function App() {
  // ── Batch mode ──
  const [batchMode, setBatchMode] = useState(false);
  const {
    photos,
    isExporting,
    exportProgress,
    exportComplete,
    loadBatch,
    regenerateThumbnails,
    exportAll,
    clearBatch,
  } = useBatchProcessing();

  function handleBatchSelect(files) {
    if (files.length > MAX_BATCH) {
      // Silently cap — loadBatch slices to MAX_BATCH internally
    }
    setBatchMode(true);
    loadBatch(files);
  }

  function handleBatchCancel() {
    clearBatch();
    setBatchMode(false);
  }

  // ── Camera ──
  const cameraViewRef = useRef(null);

  function handleShutterDismiss() {
    cameraViewRef.current?.dismissShutter();
  }

  const {
    captureRef,
    importRef,
    handleFileChange,
    triggerImport,
    previewImageData: rawPreview,
    sourceBlob: rawSourceBlob,
    error: cameraError,
  } = useCamera({ onBatchSelect: handleBatchSelect, onShutterDismiss: handleShutterDismiss });

  // ── Pipeline ──
  const {
    preview,
    setPreview,
    isProcessing,
    error: pipelineError,
    processPreview,
    processExport,
    worker: workerBridge,
  } = useImagePipeline();

  // ── Preset history ──
  const {
    currentId: activePresetId,
    canUndo,
    pushPreset,
    undo: undoPreset,
    reset: resetHistory,
  } = usePresetHistory(getDefaultPreset().id);

  const activePreset = PRESETS.find(p => p.id === activePresetId) ?? classicChrome;

  // ── Crop state ──
  const [croppedPreview, setCroppedPreview] = useState(null);
  const [cropState, setCropState] = useState(null);
  const [isCropMode, setIsCropMode] = useState(false);

  // sourceBlob: original file (for full-res export); cropState: applied crop rect
  const sourceBlob = rawSourceBlob;
  const previewImageData = croppedPreview ?? rawPreview;
  // fullImageData is no longer held in state — loaded on-demand during export

  const { thumbnails } = useThumbnails(previewImageData, PRESETS);

  const [favorites, setFavorites] = useState(() => getFavoritePresets(PRESET_IDS));
  const [showOriginal, setShowOriginal] = useState(false);

  // ── Preset cache (background processing) ──
  const {
    cache: presetCache,
    getProcessedPreview,
    startBackgroundProcessing,
    addToCache,
    invalidate: invalidateCache,
    pause: pauseBackgroundProcessing,
    resume: resumeBackgroundProcessing,
  } = usePresetCache(PRESETS, activePresetId, previewImageData, workerBridge);

  // Track whether background processing has been triggered for the current image
  const bgTriggeredRef = useRef(null);

  // On new raw photo: clear crop, reset history, exit batch, use smart default
  useEffect(() => {
    if (rawPreview) {
      const defaultPreset = getDefaultPreset();
      setBatchMode(false);
      clearBatch();
      setCroppedPreview(null);
      setCropState(null);
      invalidateCache();
      bgTriggeredRef.current = null;
      resetHistory(defaultPreset.id);
      processPreview(rawPreview, defaultPreset);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rawPreview]);

  // Save last photo thumbnail whenever a processed preview is ready
  useEffect(() => {
    if (preview) saveLastPhoto(preview);
  }, [preview]);

  // Trigger background processing once per photo load, after first preset is ready
  useEffect(() => {
    if (preview && previewImageData && bgTriggeredRef.current !== previewImageData) {
      bgTriggeredRef.current = previewImageData;
      startBackgroundProcessing(preview);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preview, previewImageData]);

  // When a worker result arrives for a cache miss, seed it into the cache
  useEffect(() => {
    if (preview && activePreset && !getProcessedPreview(activePreset.id)) {
      addToCache(activePreset.id, preview);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preview]);

  function handleSelectPreset(id) {
    const preset = PRESETS.find(p => p.id === id);
    validatePreset(preset);
    if (batchMode) {
      pushPreset(id);
      regenerateThumbnails(photos, preset);
    } else {
      pushPreset(id);
      const cached = getProcessedPreview(id);
      if (cached) {
        setPreview(cached);
      } else {
        // Pause background so worker is free for this user tap
        pauseBackgroundProcessing();
        processPreview(previewImageData, preset).then(() => {
          resumeBackgroundProcessing();
        });
      }
    }
  }

  function handleUndo() {
    const prevId = undoPreset();
    if (!prevId) return;
    const cached = getProcessedPreview(prevId);
    if (cached) {
      setPreview(cached);
    } else {
      pauseBackgroundProcessing();
      const preset = PRESETS.find(p => p.id === prevId);
      processPreview(previewImageData, preset).then(() => {
        resumeBackgroundProcessing();
      });
    }
  }

  function handleExportSuccess() {
    recordPresetUsage(activePreset.id);
    setFavorites(getFavoritePresets(PRESET_IDS));
  }

  // ── Crop handlers ──
  function handleCropConfirm(cropRect) {
    if (!rawPreview) return;
    const newPreview = applyCrop(rawPreview, cropRect);
    setCroppedPreview(newPreview);
    setCropState(cropRect);
    setIsCropMode(false);
    invalidateCache();
    bgTriggeredRef.current = null;
    processPreview(newPreview, activePreset);
  }

  function handleCropReset() {
    setCroppedPreview(null);
    setCropState(null);
    setIsCropMode(false);
    invalidateCache();
    bgTriggeredRef.current = null;
    if (rawPreview) processPreview(rawPreview, activePreset);
  }

  // ── Error handling ──
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

  const hasImage = !!rawPreview;

  // ── Batch mode render ──
  if (batchMode) {
    return (
      <div className="app">
        <BatchView
          photos={photos}
          activePreset={activePreset}
          onCancel={handleBatchCancel}
          onExportAll={() => exportAll(activePreset)}
          onSelectPreset={handleSelectPreset}
          presets={PRESETS}
          isExporting={isExporting}
          exportProgress={exportProgress}
          exportComplete={exportComplete}
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

  // ── Single mode render ──
  return (
    <div className="app">
      {/* Crop overlay — full-screen modal */}
      {isCropMode && rawPreview && (
        <CropOverlay
          imageData={rawPreview}
          initialCrop={cropState}
          hasPreviousCrop={!!cropState}
          onConfirm={handleCropConfirm}
          onCancel={() => setIsCropMode(false)}
          onResetCrop={handleCropReset}
        />
      )}

      {/* ── Preview area ── */}
      <div className="preview-area">
        <CameraView
          ref={cameraViewRef}
          captureRef={captureRef}
          importRef={importRef}
          handleFileChange={handleFileChange}
          preview={preview}
          previewImageData={previewImageData}
          isProcessing={isProcessing}
          showOriginal={showOriginal}
        >
          {hasImage && (
            <div className="top-overlay">
              <div className="top-overlay-left">
                {canUndo && (
                  <button
                    className="undo-btn"
                    onClick={handleUndo}
                    aria-label="Undo preset change"
                  >
                    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
                      <path d="M6 3L2 7L6 11" stroke="currentColor" strokeWidth="1.5"
                            strokeLinecap="round" strokeLinejoin="round"/>
                      <path d="M2 7H12C14.2091 7 16 8.79086 16 11V11C16 13.2091 14.2091 15 12 15H9"
                            stroke="currentColor" strokeWidth="1.5"
                            strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </button>
                )}
                <CompareButton
                  onPressStart={() => setShowOriginal(true)}
                  onPressEnd={() => setShowOriginal(false)}
                  visible={!!preview}
                />
              </div>
              <ExportButton
                sourceBlob={sourceBlob}
                cropState={cropState}
                processExport={processExport}
                preset={activePreset}
                onError={setExportError}
                onSuccess={handleExportSuccess}
              />
            </div>
          )}
        </CameraView>
      </div>

      {/* ── Controls column ── */}
      <div className="controls-column">
        {hasImage && (
          <div className="preset-strip-wrapper">
            <PresetSelector
              presets={PRESETS}
              activePresetId={activePreset.id}
              onSelect={handleSelectPreset}
              isProcessing={isProcessing}
              thumbnails={thumbnails}
              favorites={favorites}
              readyPresets={presetCache}
            />
          </div>
        )}

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
              onClick={() => {
                cameraViewRef.current?.triggerShutter();
                captureRef.current?.click();
              }}
            >
              <span className="capture-btn-inner" />
            </button>
          </div>

          <div className="action-bar-side action-bar-right">
            {hasImage && (
              <button
                className="crop-btn"
                aria-label="Crop image"
                onClick={() => setIsCropMode(true)}
              >
                <svg width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden="true">
                  <path d="M6 2V16H20" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                  <path d="M16 20V6H2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
              </button>
            )}
          </div>
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
